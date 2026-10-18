export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  let session = sessionFromRequest(req);

  // Fallback: validate signed x-telegram-init-data header if JWT not present
  if (!session) {
    const rawInitData = req.headers.get('x-telegram-init-data');
    const token = process.env.BOT_TOKEN ?? '';
    if (rawInitData && token) {
      const { validateInitData } = await import('@/lib/telegram');
      const { roleFor } = await import('@/lib/auth');
      const v = validateInitData(rawInitData, token, 86400);
      if (v.ok && v.user?.id) {
        session = { tgId: String(v.user.id), username: v.user.username, role: roleFor(String(v.user.id)) };
      }
    }
  }

  if (!session || !session.tgId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tgIdParam = url.searchParams.get('tgId');
  if (tgIdParam && tgIdParam !== session.tgId && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const tgId = session.tgId;

  const prisma = db();
  if (!prisma) {
    return NextResponse.json({
      telegramId: tgId,
      name: session?.username || 'TZ User',
      username: session?.username,
      walletBalance: 0,
      referralEarnings: 0,
      referralCode: `TZ${tgId}`,
      status: 'ACTIVE',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(tgId) },
    });

    if (!user) {
      return NextResponse.json({
        telegramId: tgId,
        name: session?.username || 'TZ User',
        username: session?.username,
        walletBalance: 0,
        referralEarnings: 0,
        referralCode: `TZ${tgId}`,
        status: 'ACTIVE',
      });
    }

    return NextResponse.json({
      telegramId: user.telegramId.toString(),
      name: user.firstName || user.username || 'TZ User',
      username: user.username || undefined,
      walletBalance: Number(user.walletBalance || 0),
      referralEarnings: Number(user.referralEarnings || 0),
      referralCode: user.referralCode,
      status: user.status,
    });
  } catch (e) {
    console.error('Error fetching /api/users/me:', e);
    return NextResponse.json({
      telegramId: tgId,
      name: session?.username || 'TZ User',
      username: session?.username,
      walletBalance: 0,
      referralEarnings: 0,
      referralCode: `TZ${tgId}`,
      status: 'ACTIVE',
    });
  }
}
