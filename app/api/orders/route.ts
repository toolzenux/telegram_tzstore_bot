export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { quote } from '@/lib/pricing';
import { store } from '@/lib/store';
import { sessionFromRequest } from '@/lib/auth';
import { requireAdminToken } from '@/lib/admin-auth';
import { newId } from '@/lib/payments';
const hits = new Map<string, { n: number; t: number }>();
const WINDOW_MS = 60_000;
const MAX_HITS = 60; // per buyer+product per minute — generous for qty tapping, still blocks abuse
function limited(key: string) {
  const now = Date.now();
  const h = hits.get(key) ?? { n: 0, t: now };
  if (now - h.t > WINDOW_MS) { hits.set(key, { n: 1, t: now }); return false; }
  h.n += 1; hits.set(key, h); return h.n > MAX_HITS;
}
export async function POST(req: Request) {
  const j = await req.json().catch(() => ({}));
  const p = z.object({ productId: z.string(), qty: z.number().int().min(1).max(100) }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  // Testing mode: anyone can order. Owner (Telegram session) recorded when present.
  const s = sessionFromRequest(req);
  const ip = req.headers.get('x-forwarded-for') ?? 'local';
  if (limited(`${ip}:${p.data.productId}`)) {
    const r = NextResponse.json({ error: 'too many tries — wait a few seconds and tap Buy once' }, { status: 429 });
    r.headers.set('Retry-After', '20');
    return r;
  }
  try {
    let q;
    try {
      q = quote(p.data.productId, p.data.qty);
    } catch {
      // Shared admin-backend product: price from backend, no local tiers
      const { sharedProduct } = await import('@/lib/admin-api');
      const sp = await sharedProduct(p.data.productId);
      if (!sp) return NextResponse.json({ error: 'unknown product' }, { status: 400 });
      if (sp.stock <= 0) return NextResponse.json({ error: 'out of stock' }, { status: 400 });
      const { unitPriceFor } = await import('@/lib/seed-data');
      const unit = sp.tiers && sp.tiers.length ? unitPriceFor(sp as any, p.data.qty) : Number(sp.priceUsdt);
      q = { productId: sp.id, qty: p.data.qty, unitPrice: unit, total: Math.round(unit * p.data.qty * 100) / 100 };
    }
    const order = store.createOrder({ id: newId('ord'), userTg: s?.tgId ?? 'dev-user', productId: q.productId, qty: q.qty, unitPrice: q.unitPrice, total: q.total, status: 'PENDING', createdAt: new Date().toISOString() });
    const { syncOrderToBackend } = await import('@/lib/admin-api');
    void syncOrderToBackend({ orderNo: order.id, userTg: order.userTg, productId: order.productId, qty: order.qty, amountUsdt: order.total }).catch(() => null);
    return NextResponse.json({ order });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  let o = store.getOrder(id);
  let dbProduct: any = null;

  if (!o && !process.env.VITEST) {
    const { sharedOrder } = await import('@/lib/admin-api');
    const dbOrder = await sharedOrder(id);
    if (dbOrder) {
      if (!o || dbOrder.status === 'DELIVERED') {
        o = {
          id: dbOrder.id,
          userTg: dbOrder.userTg,
          productId: dbOrder.productId,
          qty: dbOrder.qty,
          unitPrice: dbOrder.unitPrice,
          total: dbOrder.total,
          status: dbOrder.status,
          createdAt: dbOrder.createdAt,
          code: dbOrder.code,
          deliveries: dbOrder.deliveries,
        };
        // Cache in local store
        try {
          if (!store.getOrder(id)) store.createOrder(o);
          else {
            store.setOrderStatus(o.id, o.status);
            if (o.deliveries) store.setOrderDeliveries(o.id, o.deliveries);
          }
        } catch {}
      }
      if (dbOrder.product) {
        dbProduct = dbOrder.product;
      }
    }
  }

  if (!o) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let session = sessionFromRequest(req);
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

  const isAdmin = requireAdminToken(req) === null || session?.role === 'ADMIN';
  const isOwner = Boolean(session && (session.tgId === o.userTg || String(session.tgId) === String(o.userTg))) || (process.env.NODE_ENV !== 'production' && o.userTg === 'dev-user');

  // Protect sensitive order delivery info: only owner and admin can view credentials
  if (!isOwner && !isAdmin) {
    if (session && String(session.tgId) !== String(o.userTg) && o.userTg !== 'dev-user') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    // Redact secrets if accessed without confirmed ownership/admin auth
    const safeOrder = { ...o, deliveries: undefined, code: undefined };
    let prod: any = dbProduct;
    if (!prod) {
      try { prod = store.getProduct(o.productId); } catch { prod = null; }
      if (!prod) {
        const { sharedProduct } = await import('@/lib/admin-api');
        prod = await sharedProduct(o.productId);
      }
    }
    return NextResponse.json({ order: safeOrder, product: prod ? { id: prod.id, title: prod.title, logo: prod.logo, categorySlug: prod.categorySlug } : null });
  }

  let prod: any = dbProduct;
  if (!prod) {
    try { prod = store.getProduct(o.productId); } catch { prod = null; }
    if (!prod) {
      const { sharedProduct } = await import('@/lib/admin-api');
      prod = await sharedProduct(o.productId);
    }
  }
  return NextResponse.json({ order: o, product: prod ? { id: prod.id, title: prod.title, logo: prod.logo, categorySlug: prod.categorySlug } : null });
}
