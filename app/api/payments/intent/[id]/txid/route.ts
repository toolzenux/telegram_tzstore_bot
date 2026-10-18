import { NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { fulfillOrder } from '@/lib/fulfill';
import { checkTxidOnBinance } from '@/lib/binance-check';

// User pastes Binance Order ID / TxID on the pay page (testing mode: open to everyone).
// Saves it, auto-checks against our Spot deposit history, fulfills on match.
const schema = z.object({ txid: z.string().min(6).max(120) });
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const j = await req.json().catch(() => ({}));
  const p = schema.safeParse({ txid: String(j.txid ?? '').trim() });
  if (!p.success) return NextResponse.json({ error: 'Enter a valid TxID / Order ID (6+ chars)' }, { status: 400 });
  let it = store.getIntent(params.id);
  if (!it && !process.env.VITEST) {
    try {
      const { db } = await import('@/lib/db');
      const prisma = db();
      if (prisma) {
        const row = await prisma.setting.findUnique({ where: { key: `intent:${params.id}` } });
        if (row && row.value) {
          it = row.value as any;
          if (it) {
            try { store.createIntent(it); } catch {}
          }
        }
      }
    } catch {}
  }
  if (!it) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // If already completed, return early
  if (it.status === 'CONFIRMED' || it.status === 'FULFILLED') return NextResponse.json({ ok: true, state: 'already', intent: it });

  // Enforce uniqueness to prevent TxID replay / double spending
  const normalizedTxid = p.data.txid.toLowerCase();
  const txidReused = store.allIntents().some(
    (x) => x.id !== it.id && x.txHash?.toLowerCase() === normalizedTxid && (x.status === 'CONFIRMED' || x.status === 'FULFILLED'),
  );
  if (txidReused) {
    return NextResponse.json({ error: 'This TxID / Order ID has already been credited to another order' }, { status: 400 });
  }

  // Check on Binance FIRST before rejecting on expiration:
  // If user paid but 20m passed, we must still honor the payment!
  const isExpired = it.status === 'CANCELLED' || it.status === 'EXPIRED';
  const check = await checkTxidOnBinance(p.data.txid, it.amount);

  if (check.state === 'matched') {
    const matchedHash = check.txid || p.data.txid;
    store.setIntent(it.id, { txHash: matchedHash, status: 'CONFIRMED' });
    store.setOrderStatus(it.orderId, 'PENDING');

    if (!process.env.VITEST) {
      try {
        const { db } = await import('@/lib/db');
        const prisma = db();
        if (prisma) {
          await prisma.order.update({
            where: { orderNo: it.orderId },
            data: { txid: matchedHash, binancePayOrderNo: matchedHash, paymentStatus: 'PENDING' },
          }).catch(() => null);
          await prisma.setting.upsert({
            where: { key: `intent:${it.id}` },
            create: { key: `intent:${it.id}`, value: { ...it, txHash: matchedHash, status: 'CONFIRMED' } as any },
            update: { value: { ...it, txHash: matchedHash, status: 'CONFIRMED' } as any },
          }).catch(() => null);
        }
      } catch {}
    }

    await fulfillOrder(it.orderId);
    const order = store.getOrder(it.orderId);
    return NextResponse.json({
      ok: true,
      state: 'matched',
      message: `✅ Verified on Binance — $${(check.amount ?? it.amount).toFixed(2)} received.`,
      intent: store.getIntent(it.id),
      orderStatus: order?.status,
    });
  }

  // If not matched and intent was expired/cancelled, reject now
  if (isExpired) {
    return NextResponse.json({ error: 'Deposit expired and no matching Binance payment found. Create a new deposit or contact support.' }, { status: 400 });
  }

  store.setIntent(it.id, { txHash: p.data.txid });
  if (check.state === 'not-found') {
    store.setIntent(it.id, { status: 'NEEDS_REVIEW' });
    store.setOrderStatus(it.orderId, 'NEEDS_REVIEW');
    const order = store.getOrder(it.orderId);
    const { sendAdminReviewAlert } = await import('@/lib/telegram-bot');
    sendAdminReviewAlert(it, order, p.data.txid).catch(() => null);
  }
  if (check.state === 'no-keys') {
    return NextResponse.json({ ok: true, state: 'no-keys', intent: store.getIntent(it.id) });
  }
  return NextResponse.json({ ok: true, state: check.state, message: `🔍 ${check.reason}`, intent: store.getIntent(it.id) });
}
