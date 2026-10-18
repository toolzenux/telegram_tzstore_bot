export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
export async function GET(_req: Request, { params }: { params: { id: string } }) {
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

  // Auto-check Binance payment if pending or needs review
  const ageMs = Date.now() - new Date((it as any).createdAt || Date.now()).getTime();
  if ((it.status === 'PENDING' || it.status === 'NEEDS_REVIEW') && it.provider === 'BINANCE' && (it.txHash || ageMs > 5000)) {
    try {
      const { checkTxidOnBinance, autoMatchBinancePayment } = await import('@/lib/binance-check');
      const { fulfillOrder } = await import('@/lib/fulfill');

      let checkRes = it.txHash
        ? await checkTxidOnBinance(it.txHash, it.amount)
        : await autoMatchBinancePayment(it.amount, new Date((it as any).createdAt || Date.now()).getTime());


      if (checkRes.state === 'matched') {
        const matchedTxid = checkRes.txid || it.txHash || 'BINANCE-MATCH';
        store.setIntent(it.id, { txHash: matchedTxid, status: 'CONFIRMED' });
        store.setOrderStatus(it.orderId, 'PENDING');

        if (!process.env.VITEST) {
          try {
            const { db } = await import('@/lib/db');
            const prisma = db();
            if (prisma) {
              await prisma.order.update({
                where: { orderNo: it.orderId },
                data: { txid: matchedTxid, binancePayOrderNo: matchedTxid, paymentStatus: 'PENDING' },
              }).catch(() => null);
              await prisma.setting.upsert({
                where: { key: `intent:${it.id}` },
                create: { key: `intent:${it.id}`, value: { ...it, txHash: matchedTxid, status: 'CONFIRMED' } as any },
                update: { value: { ...it, txHash: matchedTxid, status: 'CONFIRMED' } as any },
              }).catch(() => null);
            }
          } catch {}
        }

        await fulfillOrder(it.orderId);
        return NextResponse.json({ intent: store.getIntent(it.id) });
      }
    } catch (err) {
      console.warn('Auto-check Binance in status error:', err);
    }
  }

  // Check expiration only if not already confirmed or fulfilled
  if (it.status === 'PENDING' && new Date(it.expiresAt).getTime() < Date.now()) {
    store.setIntent(it.id, { status: 'EXPIRED' });
    store.setOrderStatus(it.orderId, 'CANCELLED');
    return NextResponse.json({ intent: { ...it, status: 'EXPIRED' } });
  }
  return NextResponse.json({ intent: it });
}

