import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateInitData } from '@/lib/telegram';
import { signAccess, signRefresh } from '@/lib/admin-jwt';
import { db } from '@/lib/db';

const schema = z.object({ initData: z.string().min(1) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const p = schema.safeParse(json);
  if (!p.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const adminToken = process.env.ADMIN_BOT_TOKEN;
  const userToken = process.env.BOT_TOKEN;
  const tokens = [adminToken, userToken].filter(Boolean) as string[];

  if (tokens.length === 0) {
    return NextResponse.json({ error: 'Bot tokens not configured' }, { status: 500 });
  }

  let validationResult: { ok: boolean; user?: any } = { ok: false };
  for (const token of tokens) {
    const v = validateInitData(p.data.initData, token, 86400);
    if (v.ok && v.user?.id) {
      validationResult = v;
      break;
    }
  }

  if (!validationResult.ok || !validationResult.user?.id) {
    return NextResponse.json({ error: 'Invalid Telegram WebApp signature' }, { status: 401 });
  }

  const tgId = String(validationResult.user.id);
  const adminIds = new Set(
    [
      process.env.ADMIN_NOTIFY_CHAT_ID,
      ...(process.env.ADMIN_USER_IDS ?? '').split(','),
      ...(process.env.ADMIN_TG_IDS ?? '').split(','),
    ]
      .map((s) => s?.trim())
      .filter(Boolean)
  );

  const prisma = db();
  let adminRecord: any = null;
  if (prisma) {
    try {
      adminRecord = await prisma.admin.findFirst({
        where: { email: { contains: tgId } },
      });
    } catch {}
  }

  const isAuthorized = adminIds.has(tgId) || adminRecord !== null;
  if (!isAuthorized) {
    return NextResponse.json(
      { error: `Unauthorized: Telegram ID ${tgId} is not configured as an administrator` },
      { status: 403 }
    );
  }

  const adminId = adminRecord?.id || `admin_tg_${tgId}`;
  const adminRole = adminRecord?.role || 'SUPER_ADMIN';
  const email = adminRecord?.email || `${tgId}@admin.tzstore.io`;

  const accessToken = signAccess(adminId, adminRole);
  const refreshToken = signRefresh(adminId);

  return NextResponse.json({
    accessToken,
    refreshToken,
    admin: {
      id: adminId,
      email,
      role: adminRole,
      name: validationResult.user.first_name || 'Admin',
    },
  });
}
