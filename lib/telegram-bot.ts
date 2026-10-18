import https from 'node:https';
import { store } from './store';

const CUSTOMER_BOT_TOKEN = () => process.env.BOT_TOKEN || '';
const ADMIN_BOT_TOKEN = () => process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN || '';

function postTelegram(token: string, method: string, payload: any): Promise<boolean> {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'POST',
        family: 4,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve(Boolean(j.ok));
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', (err) => { console.error(`[Telegram API] Error ${method}:`, err.message); resolve(false); });
    req.write(data);
    req.end();
  });
}

export async function getAdminChatId(): Promise<string | null> {
  const envChatId = process.env.ADMIN_NOTIFY_CHAT_ID?.trim();
  if (envChatId && envChatId.length > 0) return envChatId;

  // Check Prisma Setting for registered admin chat ID
  if (!process.env.VITEST) {
    try {
      const { db } = await import('./db');
      const prisma = db();
      if (prisma) {
        const row = await prisma.setting.findUnique({ where: { key: 'admin_notify_chat_id' } });
        if (row?.value) {
          const val = typeof row.value === 'string' ? row.value : (row.value as any)?.chatId;
          if (val) return String(val);
        }
      }
    } catch {}
  }

  // Fallback to local store
  const stored = (store as any).getSetting?.('admin_notify_chat_id');
  return stored ? String(stored) : null;
}

export async function setAdminChatId(chatId: string): Promise<void> {
  if (!process.env.VITEST) {
    try {
      const { db } = await import('./db');
      const prisma = db();
      if (prisma) {
        await prisma.setting.upsert({
          where: { key: 'admin_notify_chat_id' },
          create: { key: 'admin_notify_chat_id', value: { chatId } },
          update: { value: { chatId } },
        });
      }
    } catch {}
  }
}

/**
 * 1. 🤖 Instant Delivery to Customer's Telegram Chat (Bot DM)
 */
export async function sendCustomerDelivery(
  userTg: string,
  order: any,
  deliveries: Array<{ login: string; password: string }>,
  code?: string
): Promise<boolean> {
  if (process.env.VITEST) return false;
  const token = CUSTOMER_BOT_TOKEN();
  if (!token) return false;

  let chatId: string | null = null;
  const tgClean = String(userTg ?? '').trim();
  if (/^\d+$/.test(tgClean)) {
    chatId = tgClean;
  } else {
    try {
      const { db } = await import('./db');
      const prisma = db();
      if (prisma) {
        const dbOrder = await prisma.order.findUnique({
          where: { orderNo: order.id },
          select: { userId: true },
        });
        if (dbOrder?.userId) chatId = String(dbOrder.userId);
      }
    } catch {}
  }

  if (!chatId) return false;

  let prodTitle = order.productId;
  try {
    const prod = store.getProduct(order.productId);
    if (prod?.title) prodTitle = prod.title;
  } catch {}

  const credLines =
    deliveries && deliveries.length > 0
      ? deliveries
          .map(
            (d, i) =>
              `<b>🔑 Item ${deliveries.length > 1 ? `#${i + 1}` : ''}</b>\n` +
              `👤 <b>Email / ID:</b> <code>${d.login}</code>\n` +
              `🔐 <b>Password / Key:</b> <code>${d.password}</code>`
          )
          .join('\n\n')
      : `<b>🔑 Activation Code / Link:</b>\n<code>${code ?? order.code ?? ''}</code>`;

  const webAppUrl = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  const text =
    `🎉 <b>Order Delivered Successfully!</b>\n\n` +
    `📦 <b>Order ID:</b> <code>${order.id}</code>\n` +
    `🎁 <b>Product:</b> <b>${prodTitle}</b>\n` +
    `🛒 <b>Quantity:</b> ${order.qty} pc${order.qty > 1 ? 's' : ''}\n` +
    `💵 <b>Total Paid:</b> $${Number(order.total).toFixed(2)} USDT\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Delivered Credentials:</b>\n\n` +
    `${credLines}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 <i>Tip: Tap on any credential above to copy it instantly.</i>\n\n` +
    `💬 Need help? Contact @TzStore_Support`;

  return postTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍️ Open Mini App Store', web_app: { url: webAppUrl } }],
        [{ text: '💬 Contact Support', url: 'https://t.me/TzStore_Support' }],
      ],
    },
  });
}

/**
 * 2. 🔔 Instant Admin Telegram Channel Alerts with 1-Tap Approve
 */
export async function sendAdminReviewAlert(intent: any, order: any, txid: string): Promise<boolean> {
  if (process.env.VITEST) return false;
  const token = ADMIN_BOT_TOKEN();
  const adminChatId = await getAdminChatId();
  if (!token || !adminChatId) return false;

  let prodTitle = order?.productId || intent?.orderId;
  try {
    const prod = store.getProduct(order?.productId);
    if (prod?.title) prodTitle = prod.title;
  } catch {}

  const text =
    `🟡 <b>Payment Needs Review</b>\n\n` +
    `📦 <b>Order ID:</b> <code>${order?.id || intent.orderId}</code>\n` +
    `💵 <b>Amount:</b> <b>$${Number(intent.amount).toFixed(2)} USDT</b>\n` +
    `🎁 <b>Product:</b> ${prodTitle}\n` +
    `🛒 <b>Quantity:</b> ${order?.qty || 1} pc\n` +
    `🔍 <b>Customer TxID:</b> <code>${txid}</code>\n` +
    `👤 <b>Customer TG ID:</b> <code>${order?.userTg || 'N/A'}</code>\n\n` +
    `<i>Tap an action below to approve and deliver immediately:</i>`;

  return postTelegram(token, 'sendMessage', {
    chat_id: adminChatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve & Deliver', callback_data: `approve:${order?.id || intent.orderId}` },
          { text: '❌ Reject', callback_data: `reject:${order?.id || intent.orderId}` },
        ],
        [
          { text: '🔍 Check TxID on Binance', url: `https://tronscan.org/#/transaction/${txid}` },
        ],
      ],
    },
  });
}

/**
 * 3. ⚠️ Automated Low-Stock Alerts for Admins
 */
export async function sendAdminLowStockAlert(productId: string, remainingCount: number): Promise<boolean> {
  if (process.env.VITEST) return false;
  const token = ADMIN_BOT_TOKEN();
  const adminChatId = await getAdminChatId();
  if (!token || !adminChatId) return false;

  let prodTitle = productId;
  try {
    const prod = store.getProduct(productId);
    if (prod?.title) prodTitle = prod.title;
  } catch {}

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:5173';
  const text =
    `⚠️ <b>LOW STOCK ALERT!</b>\n\n` +
    `📦 <b>Product:</b> <b>${prodTitle}</b>\n` +
    `📉 <b>Remaining in Stock:</b> <b>${remainingCount} pcs left</b>\n\n` +
    `🚨 <i>Please restock credentials in the Admin Panel soon to avoid selling out!</i>`;

  return postTelegram(token, 'sendMessage', {
    chat_id: adminChatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Restock in Admin Panel', url: `${adminUrl}/products` }],
      ],
    },
  });
}
