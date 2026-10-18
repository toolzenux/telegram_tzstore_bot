import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateInitData } from '@/lib/telegram';
import { signSession, roleFor } from '@/lib/auth';
import { db } from '@/lib/db';

const body = z.object({ initData: z.string().min(1) });

export async function POST(req: Request) {
  const j = await req.json().catch(() => ({}));
  const p = body.safeParse(j);
  if (!p.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const token = process.env.BOT_TOKEN ?? '';
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server configuration error: BOT_TOKEN is required' }, { status: 500 });
    }
    // Dev fallback: accept unsigned initData only in local non-production environments
    return NextResponse.json({ token: 'dev', dev: true });
  }

  const v = validateInitData(p.data.initData, token, 86400);
  if (!v.ok) return NextResponse.json({ error: v.reason || 'invalid telegram signature' }, { status: 401 });

  const tgUser = v.user;
  if (!tgUser || !tgUser.id || !/^\d+$/.test(String(tgUser.id))) {
    return NextResponse.json({ error: 'invalid telegram user payload' }, { status: 400 });
  }

  const tgId = String(tgUser.id);
  const prisma = db();
  let dbUser: any = null;

  if (prisma) {
    try {
      const tgBigInt = BigInt(tgId);
      const existing = await prisma.user.findUnique({ where: { telegramId: tgBigInt } });

      if (existing?.status === 'BANNED') {
        return NextResponse.json({ error: 'This account has been suspended' }, { status: 403 });
      }

      let referredBy: bigint | null = null;
      if (!existing) {
        const { parseStartParam } = await import('@/lib/telegram');
        const startParam = parseStartParam(p.data.initData);
        if (startParam) {
          const cleanRef = startParam.trim();
          const target = cleanRef.startsWith('ref_') ? cleanRef.slice(4) : cleanRef;
          if (/^\d+$/.test(target) && target !== tgId) {
            const referrer = await prisma.user.findUnique({ where: { telegramId: BigInt(target) } }).catch(() => null);
            if (referrer) referredBy = referrer.telegramId;
          } else if (target) {
            const referrer = await prisma.user.findUnique({ where: { referralCode: target } }).catch(() => null);
            if (referrer && String(referrer.telegramId) !== tgId) referredBy = referrer.telegramId;
          }
        }
      }

      const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
      const code = `TZ${tgId.slice(-4)}${randomSuffix}`;

      dbUser = await prisma.user.upsert({
        where: { telegramId: tgBigInt },
        create: {
          telegramId: tgBigInt,
          username: tgUser.username || null,
          firstName: tgUser.first_name || null,
          referralCode: code,
          referredByUserId: referredBy,
          status: 'ACTIVE',
          walletBalance: 0,
          referralEarnings: 0,
        },
        update: {
          username: tgUser.username || undefined,
          firstName: tgUser.first_name || undefined,
        },
      });
    } catch (e) {
      console.warn('Prisma auth upsert error:', e);
    }
  }

  const jwt = signSession({ tgId, username: tgUser?.username, role: roleFor(tgId) });

  return NextResponse.json({
    token: jwt,
    authenticated: true,
    user: {
      telegramId: tgId,
      name: tgUser?.first_name ? `${tgUser.first_name} ${tgUser.last_name || ''}`.trim() : (dbUser?.firstName || 'TZ User'),
      username: tgUser?.username || dbUser?.username || undefined,
      walletBalance: Number(dbUser?.walletBalance || 0),
      referralEarnings: Number(dbUser?.referralEarnings || 0),
      referralCode: dbUser?.referralCode || `TZ${tgId}`,
    },
  });
}
