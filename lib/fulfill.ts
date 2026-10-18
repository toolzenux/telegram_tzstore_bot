import { store } from './store';
import { sendCustomerDelivery, sendAdminLowStockAlert } from './telegram-bot';

// Single shared fulfill path for Stars / crypto / Binance webhooks + manual admin fulfill.
// Idempotent: only PENDING/CONFIRMED/NEEDS_REVIEW orders are processed; DELIVERED returns as-is.
// Takes one vault row per qty unit. Empty vault -> NEEDS_REVIEW (manual delivery).
export async function fulfillOrder(orderId: string): Promise<{ status: string; deliveries?: Array<{ login: string; password: string }> }> {
  let order = store.getOrder(orderId);
  if (!order) {
    const { sharedOrder } = await import('./admin-api');
    const dbOrder = await sharedOrder(orderId);
    if (dbOrder) {
      order = {
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
      try { store.createOrder(order); } catch {}
    }
  }
  if (!order) throw new Error('unknown order');
  if (order.status === 'DELIVERED') return { status: 'DELIVERED', deliveries: order.deliveries ?? [] };
  if (order.status !== 'PENDING' && order.status !== 'CONFIRMED' && order.status !== 'NEEDS_REVIEW') {
    return { status: order.status };
  }
  const hasVault = store.vaultHas(order.productId);
  let taken = hasVault ? store.vaultTake(order.productId, order.qty, order.id) : null;

  // If local store vault didn't have enough items, check Prisma stockItem table
  if (!taken && !process.env.VITEST) {
    try {
      const { db } = await import('./db');
      const prisma = db();
      if (prisma) {
        const dbOrder = await prisma.order.findUnique({ where: { orderNo: order.id } });
        if (dbOrder) {
          const pStocks = await prisma.stockItem.findMany({
            where: { productId: order.productId, isSold: false },
            take: order.qty,
            orderBy: { createdAt: 'asc' },
          });
          if (pStocks && pStocks.length >= order.qty) {
            const stockIds = pStocks.map((s) => s.id);
            await prisma.stockItem.updateMany({
              where: { id: { in: stockIds } },
              data: { isSold: true, orderId: dbOrder.id },
            });
            taken = pStocks.map((s) => {
              const parts = s.data.split(':');
              return { login: parts[0] || 'account', password: parts[1] || s.data };
            });
          }
        }
      }
    } catch (e) {
      console.warn('Prisma stockItem fulfillment error:', e);
    }
  }

  if (hasVault || taken) {
    if (!taken) {
      store.setOrderStatus(order.id, 'NEEDS_REVIEW');
      try {
        const { db } = await import('./db');
        const prisma = db();
        if (prisma) await prisma.order.update({ where: { orderNo: order.id }, data: { paymentStatus: 'PAID', deliveryStatus: 'FAILED' } }).catch(() => null);
      } catch {}
      return { status: 'NEEDS_REVIEW' };
    }
    store.setOrderDeliveries(order.id, taken);
    store.setOrderStatus(order.id, 'DELIVERED');
    const it = store.allIntents().find((i) => i.orderId === order.id && (i.status === 'PENDING' || i.status === 'CONFIRMED'));
    if (it) store.setIntent(it.id, { status: 'FULFILLED' });
    if (!process.env.VITEST) {
      void (async () => {
        try {
          const { db } = await import('./db');
          const prisma = db();
          if (prisma) await prisma.order.update({ where: { orderNo: order.id }, data: { paymentStatus: 'PAID', deliveryStatus: 'DELIVERED', deliveredData: JSON.stringify(taken) } }).catch(() => null);
        } catch {}
        sendCustomerDelivery(order.userTg, order, taken).catch(() => null);
        // Low-stock check: alert admin if stock drops to <= 3
        try {
          const remaining = store.vaultAvailable(order.productId);
          if (remaining <= 3) {
            sendAdminLowStockAlert(order.productId, remaining).catch(() => null);
          }
        } catch {}
      })();
    }
    return { status: 'DELIVERED', deliveries: taken };
  }
  // Legacy path: products without vault rows keep the placeholder-code behavior.
  const code = `EM-${order.id.slice(-6).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  store.setOrderStatus(order.id, 'DELIVERED', code);
  const it = store.allIntents().find((i) => i.orderId === order.id && (i.status === 'PENDING' || i.status === 'CONFIRMED'));
  if (it) store.setIntent(it.id, { status: 'FULFILLED' });
  if (!process.env.VITEST) {
    void (async () => {
      try {
        const { db } = await import('./db');
        const prisma = db();
        if (prisma) await prisma.order.update({ where: { orderNo: order.id }, data: { paymentStatus: 'PAID', deliveryStatus: 'DELIVERED', deliveredData: code } }).catch(() => null);
      } catch {}
      sendCustomerDelivery(order.userTg, order, [], code).catch(() => null);
    })();
  }
  return { status: 'DELIVERED' };
}

