import { NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { sessionFromRequest } from '@/lib/auth';
import { newId, starsFor, demoAddress, createStarsInvoiceLink, type Provider } from '@/lib/payments';
import { flags } from '@/lib/env';
const schema = z.object({ orderId: z.string(), provider: z.enum(['STARS', 'BINANCE', 'TRC20', 'BEP20', 'BTC']), binanceUid: z.string().optional() });
const enabled: Record<Provider, boolean> = { STARS: flags.stars, BINANCE: flags.binance, TRC20: flags.trc20, BEP20: flags.bep20, BTC: flags.btc };
export async function POST(req: Request) {
  const j = await req.json().catch(() => ({}));
  const p = schema.safeParse(j);
  if (!p.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (!enabled[p.data.provider]) return NextResponse.json({ error: 'provider disabled' }, { status: 400 });
  let order = store.getOrder(p.data.orderId);
  if (!order) {
    const { db } = await import('@/lib/db');
    const prisma = db();
    if (prisma) {
      try {
        const dbOrder = await prisma.order.findUnique({ where: { orderNo: p.data.orderId } });
        if (dbOrder) {
          order = {
            id: dbOrder.orderNo,
            userTg: dbOrder.userId.toString(),
            productId: dbOrder.productId,
            qty: dbOrder.qty,
            unitPrice: Number(dbOrder.amountUsdt) / (dbOrder.qty || 1),
            total: Number(dbOrder.amountUsdt),
            status: dbOrder.paymentStatus,
            createdAt: dbOrder.createdAt.toISOString(),
          };
        }
      } catch {}
    }
  }
  if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 });
  if (order.status !== 'PENDING') return NextResponse.json({ error: 'order not payable' }, { status: 400 });

  // Reuse existing active pending intent if available (0-latency instant response)
  const existing = store.allIntents().find(
    (it) => it.orderId === order.id && it.provider === p.data.provider && it.status === 'PENDING' && new Date(it.expiresAt) > new Date()
  );
  if (existing) {
    let extraJson: any = {};
    if (existing.provider === 'STARS') {
      const link = existing.invoiceLink || await createStarsInvoiceLink(`TZ Store ${order.productId} x${order.qty}`, existing.id, Number(existing.amount)).catch(() => `https://t.me/invoice/dev_${existing.id}`);
      existing.invoiceLink = link;
      extraJson = { invoiceLink: link, stars: existing.amount };
    }
    return NextResponse.json({ intent: existing, ...extraJson });
  }

  const id = newId('in');
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  let intent;
  let extraJson: any = {};
  if (p.data.provider === 'STARS') {
    const stars = starsFor(order.total);
    const link = await createStarsInvoiceLink(`TZ Store ${order.productId} x${order.qty}`, id, stars).catch(() => `https://t.me/invoice/dev_${id}`);
    intent = store.createIntent({ id, orderId: order.id, provider: 'STARS', asset: 'XTR', amount: stars, memo: id, status: 'PENDING', expiresAt, invoiceLink: link });
    extraJson = { invoiceLink: link, stars };
  } else if (p.data.provider === 'BINANCE') {
    const rawUid = process.env.NEXT_PUBLIC_BINANCE_UID || process.env.BINANCE_UID || '1134278389';
    const storeUid = (rawUid && !rawUid.includes('*') && rawUid.length >= 6) ? rawUid : '1134278389';
    const address = (p.data.binanceUid && !p.data.binanceUid.includes('*')) ? p.data.binanceUid.trim() : storeUid;
    intent = store.createIntent({ id, orderId: order.id, provider: 'BINANCE', asset: 'USDT', amount: order.total, address, memo: id, status: 'PENDING', expiresAt });
  } else {
    const asset = p.data.provider === 'TRC20' ? 'USDT-TRC20' : p.data.provider === 'BEP20' ? 'USDT-BEP20' : 'BTC';
    intent = store.createIntent({ id, orderId: order.id, provider: p.data.provider, asset, amount: order.total, address: demoAddress(p.data.provider, id), memo: id, status: 'PENDING', expiresAt });
  }

  // Persist into DB setting for serverless cross-instance resilience asynchronously
  if (!process.env.VITEST) {
    import('@/lib/db')
      .then(({ db }) => {
        const prisma = db();
        if (prisma) {
          prisma.setting
            .upsert({
              where: { key: `intent:${intent.id}` },
              create: { key: `intent:${intent.id}`, value: intent as any },
              update: { value: intent as any },
            })
            .catch(() => null);
        }
      })
      .catch(() => {});
  }

  return NextResponse.json({ intent, ...extraJson });
}
