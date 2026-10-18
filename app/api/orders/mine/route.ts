export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { sessionFromRequest } from '@/lib/auth';
import { sharedOrdersByUser } from '@/lib/admin-api';

export async function GET(req: Request) {
  let s = sessionFromRequest(req);
  if (!s) {
    const rawInitData = req.headers.get('x-telegram-init-data');
    const token = process.env.BOT_TOKEN ?? '';
    if (rawInitData && token) {
      const { validateInitData } = await import('@/lib/telegram');
      const { roleFor } = await import('@/lib/auth');
      const v = validateInitData(rawInitData, token, 86400);
      if (v.ok && v.user?.id) {
        s = { tgId: String(v.user.id), username: v.user.username, role: roleFor(String(v.user.id)) };
      }
    }
  }

  if (!s || !s.tgId) {
    if (process.env.NODE_ENV !== 'production' && !process.env.BOT_TOKEN) {
      s = { tgId: 'dev-user', role: 'USER' };
    } else {
      return NextResponse.json({ error: 'unauthorized', orders: [] }, { status: 401 });
    }
  }

  const userTg = s.tgId;
  const localOrders = store.myOrders(userTg);
  const dbOrders = await sharedOrdersByUser(userTg).catch(() => null);

  const seen = new Set<string>();
  const merged: any[] = [];

  for (const o of localOrders) {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      merged.push(o);
    }
  }

  if (dbOrders) {
    for (const o of dbOrders) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        merged.push(o);
      }
    }
  }

  return NextResponse.json({ orders: merged });
}

