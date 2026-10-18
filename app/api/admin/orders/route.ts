export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { requireAdminToken } from '@/lib/admin-auth';
export async function GET(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  if (url.searchParams.get('clearDemo') === '1') {
    store.clearOrders();
  }
  const orders = store.allOrders().reverse().slice(0, 100);
  const intents = store.allIntents().reverse().slice(0, 100);
  const revenue = store.allOrders().filter((o: any) => ['PAID', 'DELIVERED'].includes(o.status)).reduce((s: number, o: any) => s + Number(o.total), 0);
  return NextResponse.json({ orders, intents, revenue: Math.round(revenue * 100) / 100 });
}


export async function DELETE(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.orderId) {
      store.deleteOrder(body.orderId);
      return NextResponse.json({ ok: true, deleted: body.orderId });
    }
    store.clearOrders();
    return NextResponse.json({ ok: true, cleared: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
