// TZ Store — Dedicated Admin Operations Telegram Bot
// Exclusively for store managers and super admins.
// Commands: /start, /admin, /stats, /orders, /deposits, /broadcast
// Run: npm run bot:admin (Uses ADMIN_BOT_TOKEN or BOT_TOKEN fallback)

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { store } from '../lib/store';
import { fulfillOrder } from '../lib/fulfill';

// Load .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) {
        let val = (m[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    }
  }
} catch {}

const token = process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN;
if (!token) {
  console.warn('[Admin Bot] Neither ADMIN_BOT_TOKEN nor BOT_TOKEN found in environment.');
}

const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });
export const adminBot = token
  ? new Bot(token, {
      client: {
        baseFetchConfig: {
          agent: ipv4Agent,
          compress: true,
        },
      },
    })
  : null;

const WEBAPP = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const ADMIN_PORTAL_URL = `${WEBAPP}/admin/mobile`;
function getAuthorizedAdminIds(): Set<string> {
  return new Set(
    [
      process.env.ADMIN_NOTIFY_CHAT_ID,
      process.env.ADMIN_CHAT_ID,
      ...(process.env.ADMIN_USER_IDS ?? '').split(','),
      ...(process.env.ADMIN_TG_IDS ?? '').split(','),
    ]
      .map((s) => s?.trim())
      .filter(Boolean) as string[]
  );
}

let prisma: PrismaClient | null = null;
try {
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
  }
} catch {
  prisma = null;
}

async function safeEditMessageText(ctx: any, text: string, options: any) {
  try {
    await ctx.editMessageText(text, options);
  } catch (err: any) {
    if (err?.description?.includes('message is not modified')) {
      return;
    }
    throw err;
  }
}

// Security Check: verifies if the Telegram user is an authorized admin
async function isAuthorizedAdmin(telegramId: number | string): Promise<boolean> {
  const idStr = String(telegramId);
  const adminIds = getAuthorizedAdminIds();
  // If explicitly in admin list
  if (adminIds.has(idStr)) return true;
  // If no admin IDs are configured, fail closed to prevent unauthorized access
  if (adminIds.size === 0) return false;
  // Check if linked to admin in Supabase
  if (prisma) {
    try {
      const a = await prisma.admin.findFirst({
        where: { email: { contains: idStr } },
      });
      if (a) return true;
    } catch {}
  }
  return false;
}

function adminPortalBtn(text: string, path = '') {
  const url = path ? `${ADMIN_PORTAL_URL}${path.startsWith('/') ? path : '/' + path}` : ADMIN_PORTAL_URL;
  if (url.startsWith('https://')) {
    return { text, web_app: { url } };
  }
  // Telegram API rejects http://localhost or private URLs in inline url buttons.
  return { text: `${text} (Local)`, callback_data: 'admin:local_url' };
}

function adminDashboardKeyboard(pendingOrdersCount = 0, pendingDepositsCount = 0) {
  const kb = new InlineKeyboard();
  // Primary Web App Button: Launches the full Admin Mini App directly inside Telegram if HTTPS
  if (ADMIN_PORTAL_URL.startsWith('https://')) {
    kb.row({ text: '📱 Launch Admin Mobile Mini App', web_app: { url: ADMIN_PORTAL_URL } });
  } else {
    kb.row({ text: '📱 Admin Portal (Local Server)', callback_data: 'admin:local_url' });
  }
  kb.row(
    { text: `📦 Pending Orders (${pendingOrdersCount})`, callback_data: 'admin:orders' },
    { text: `💳 Deposits (${pendingDepositsCount})`, callback_data: 'admin:deposits' }
  );
  kb.row(
    { text: '📊 Sales & KPIs', callback_data: 'admin:stats' },
    { text: '🔄 Refresh Hub', callback_data: 'admin:refresh' }
  );
  return kb;
}

async function getLiveKpis() {
  let ordersCount = store.allOrders().length;
  let revenue = store.allOrders()
    .filter((o) => o.status === 'PAID' || o.status === 'DELIVERED')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  let pendingOrders = store.allOrders().filter((o) => o.status === 'PENDING').length;
  let pendingDeposits = store.allIntents().filter((i) => i.status === 'PENDING' || i.status === 'NEEDS_REVIEW').length;
  let usersCount = 0;

  if (prisma) {
    try {
      const [ordTotal, ordPending, usrCount] = await Promise.all([
        prisma.order.count(),
        prisma.order.count({ where: { paymentStatus: 'PENDING' } }),
        prisma.user.count(),
      ]);
      if (ordTotal > 0) ordersCount = ordTotal;
      if (ordPending > 0) pendingOrders = ordPending;
      usersCount = usrCount;
    } catch {}
  }

  return { ordersCount, revenue, pendingOrders, pendingDeposits, usersCount };
}

let cachedStoreName: string | null = null;
let lastStoreNameFetch = 0;

async function getAdminStoreName(): Promise<string> {
  const now = Date.now();
  if (cachedStoreName && now - lastStoreNameFetch < 10000) {
    return cachedStoreName;
  }
  let name = store.getSetting<string>('storeName') || process.env.NEXT_PUBLIC_STORE_NAME || 'TZ Store';
  if (prisma) {
    try {
      const s = await prisma.setting.findUnique({ where: { key: 'storeName' } });
      if (s?.value && typeof s.value === 'string') {
        name = s.value;
      }
    } catch {}
  }
  cachedStoreName = name;
  lastStoreNameFetch = now;
  return name;
}

if (adminBot) {
  // /start and /admin commands
  adminBot.command(['start', 'admin'], async (ctx) => {
    const from = ctx.from!;
    const storeName = await getAdminStoreName();
    if (!(await isAuthorizedAdmin(from.id))) {
      await ctx.reply(
        `⛔ <b>Access Denied</b>\n\nThis bot is strictly reserved for ${storeName} administrators.\nYour Telegram ID: <code>${from.id}</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const { ordersCount, revenue, pendingOrders, pendingDeposits, usersCount } = await getLiveKpis();

    const text =
      `🛡️ <b>${storeName} — Admin Operations Portal</b>\n\n` +
      `👋 Welcome, <b>${from.first_name}</b> (<code>${from.id}</code>)\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>Total Store Revenue:</b> $${revenue.toFixed(2)} USDT\n` +
      `📦 <b>Orders:</b> ${ordersCount} total (<b>${pendingOrders} pending</b>)\n` +
      `💳 <b>Deposits Awaiting Check:</b> <b>${pendingDeposits}</b>\n` +
      `👥 <b>Registered Buyers:</b> ${usersCount}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ <i>Tap below to open the full mobile admin interface or manage orders in 1-click:</i>`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: adminDashboardKeyboard(pendingOrders, pendingDeposits),
    });
  });

  // Callback: Refresh Hub
  adminBot.callbackQuery('admin:refresh', async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized' });
      return;
    }
    const storeName = await getAdminStoreName();
    const { ordersCount, revenue, pendingOrders, pendingDeposits, usersCount } = await getLiveKpis();

    const text =
      `🛡️ <b>${storeName} — Admin Operations Portal</b>\n\n` +
      `🔄 <i>Updated just now</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>Total Store Revenue:</b> $${revenue.toFixed(2)} USDT\n` +
      `📦 <b>Orders:</b> ${ordersCount} total (<b>${pendingOrders} pending</b>)\n` +
      `💳 <b>Deposits Awaiting Check:</b> <b>${pendingDeposits}</b>\n` +
      `👥 <b>Registered Buyers:</b> ${usersCount}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⚡ <i>Tap below to open the full mobile admin interface:</i>`;

    await safeEditMessageText(ctx, text, {
      parse_mode: 'HTML',
      reply_markup: adminDashboardKeyboard(pendingOrders, pendingDeposits),
    });
    await ctx.answerCallbackQuery({ text: 'Hub refreshed ✅' }).catch(() => {});
  });

  // Callback: Local URL info
  adminBot.callbackQuery('admin:local_url', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.reply(
      `🌐 <b>Local Admin Portal:</b>\n<code>${ADMIN_PORTAL_URL}</code>\n\n` +
      `💡 <i>Telegram Web Apps require a public HTTPS URL. On your local machine, open the link above in your web browser, or launch an HTTPS tunnel (e.g. Cloudflare / Render) to open it inside Telegram.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // Callback: Pending Orders
  adminBot.callbackQuery('admin:orders', async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => {});
      return;
    }
    const pending = store.allOrders().filter((o) => o.status === 'PENDING');
    const kb = new InlineKeyboard();

    if (!pending.length) {
      kb.row({ text: '🔙 Back to Hub', callback_data: 'admin:refresh' });
      await safeEditMessageText(
        ctx,
        `📦 <b>Pending Orders (0)</b>\n\n✅ <i>All orders are fulfilled! No pending purchases awaiting action.</i>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    let listText = `📦 <b>Pending Orders (${pending.length})</b>\n\n`;
    for (const ord of pending.slice(0, 4)) {
      listText += `• <b>Order:</b> <code>${ord.id}</code>\n  🎁 Product: <b>${ord.productId}</b> (×${ord.qty})\n  💵 Total: <b>$${ord.total.toFixed(2)}</b>\n  👤 Buyer TG: <code>${ord.userTg}</code>\n\n`;
      kb.row({ text: `⚡ 1-Tap Fulfill ${ord.id.slice(-6)}`, callback_data: `admin:fulfill:${ord.id}` });
    }

    kb.row(adminPortalBtn('📱 Manage in Admin Portal', '/orders'));
    kb.row({ text: '🔙 Back to Hub', callback_data: 'admin:refresh' });

    await safeEditMessageText(ctx, listText, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
    await ctx.answerCallbackQuery().catch(() => {});
  });

  // Callback: 1-Tap Fulfill
  adminBot.callbackQuery(/^admin:fulfill:(.+)$/, async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => {});
      return;
    }
    const orderId = ctx.match[1];
    try {
      const res = await fulfillOrder(orderId);
      await ctx.answerCallbackQuery({ text: `Order ${orderId.slice(-6)} fulfilled! ✅`, show_alert: true });
      await ctx.reply(
        `🎉 <b>Order Fulfilled via Admin Bot!</b>\n\n📦 <b>Order ID:</b> <code>${orderId}</code>\nStatus: <b>${res.status}</b>\nCustomer has received their credentials.`,
        { parse_mode: 'HTML' }
      );
    } catch (e: any) {
      await ctx.answerCallbackQuery({ text: `Fulfill error: ${e.message}`, show_alert: true });
    }
  });

  // Callback: Deposits
  adminBot.callbackQuery('admin:deposits', async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => {});
      return;
    }
    const pendingIntents = store.allIntents().filter((i) => i.status === 'PENDING' || i.status === 'NEEDS_REVIEW');
    const kb = new InlineKeyboard();

    let text = `💳 <b>Pending Deposits & Verifications (${pendingIntents.length})</b>\n\n`;
    if (!pendingIntents.length) {
      text += `✅ <i>No unverified deposits pending review.</i>`;
    } else {
      for (const intent of pendingIntents.slice(0, 5)) {
        text += `• <b>Intent:</b> <code>${intent.id}</code>\n  Method: <b>${intent.provider}</b> | $${intent.amount.toFixed(2)} ${intent.asset}\n  Status: <i>${intent.status}</i>\n${intent.txHash ? `  TxID: <code>${intent.txHash}</code>\n` : ''}\n`;
      }
    }

    kb.row(adminPortalBtn('📱 Open Payments Portal', '/payments'));
    kb.row({ text: '🔙 Back to Hub', callback_data: 'admin:refresh' });

    await safeEditMessageText(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    await ctx.answerCallbackQuery().catch(() => {});
  });

  // Command: /stats
  adminBot.command('stats', async (ctx) => {
    const storeName = await getAdminStoreName();
    if (!(await isAuthorizedAdmin(ctx.from!.id))) {
      await ctx.reply(`⛔ <b>Access Denied:</b> This bot is strictly reserved for ${storeName} administrators.`, { parse_mode: 'HTML' });
      return;
    }
    const { ordersCount, revenue, pendingOrders, pendingDeposits, usersCount } = await getLiveKpis();
    const kb = new InlineKeyboard();
    if (ADMIN_PORTAL_URL.startsWith('https://')) {
      kb.row({ text: '📊 View Interactive Charts', web_app: { url: ADMIN_PORTAL_URL } });
    }
    kb.row({ text: '🔄 Refresh Hub', callback_data: 'admin:refresh' });

    await ctx.reply(
      `📊 <b>${storeName} — Financial & Operational Analytics</b>\n\n` +
      `💰 <b>Total Cumulative Revenue:</b> $${revenue.toFixed(2)} USDT\n` +
      `📦 <b>All-Time Orders:</b> ${ordersCount}\n` +
      `⏳ <b>Pending Orders:</b> ${pendingOrders}\n` +
      `💳 <b>Pending Deposit Sessions:</b> ${pendingDeposits}\n` +
      `👤 <b>Total Registered Customers:</b> ${usersCount}\n\n` +
      `<i>Tap below to inspect real-time sales curves in the Mobile Admin Mini App.</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // Command: /orders
  adminBot.command('orders', async (ctx) => {
    const storeName = await getAdminStoreName();
    if (!(await isAuthorizedAdmin(ctx.from!.id))) {
      await ctx.reply(`⛔ <b>Access Denied:</b> This bot is strictly reserved for ${storeName} administrators.`, { parse_mode: 'HTML' });
      return;
    }
    const pending = store.allOrders().filter((o) => o.status === 'PENDING');
    const kb = new InlineKeyboard();

    if (!pending.length) {
      kb.row(adminPortalBtn('📱 Manage in Admin Portal', '/orders'));
      await ctx.reply(`📦 <b>Pending Orders (0)</b>\n\n✅ <i>All orders are fulfilled! No pending purchases awaiting action.</i>`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    let listText = `📦 <b>Pending Orders (${pending.length})</b>\n\n`;
    for (const ord of pending.slice(0, 4)) {
      listText += `• <b>Order:</b> <code>${ord.id}</code>\n  🎁 Product: <b>${ord.productId}</b> (×${ord.qty})\n  💵 Total: <b>$${ord.total.toFixed(2)}</b>\n  👤 Buyer TG: <code>${ord.userTg}</code>\n\n`;
      kb.row({ text: `⚡ 1-Tap Fulfill ${ord.id.slice(-6)}`, callback_data: `admin:fulfill:${ord.id}` });
    }
    kb.row(adminPortalBtn('📱 Manage in Admin Portal', '/orders'));

    await ctx.reply(listText, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Command: /deposits
  adminBot.command('deposits', async (ctx) => {
    const storeName = await getAdminStoreName();
    if (!(await isAuthorizedAdmin(ctx.from!.id))) {
      await ctx.reply(`⛔ <b>Access Denied:</b> This bot is strictly reserved for ${storeName} administrators.`, { parse_mode: 'HTML' });
      return;
    }
    const pendingIntents = store.allIntents().filter((i) => i.status === 'PENDING' || i.status === 'NEEDS_REVIEW');
    const kb = new InlineKeyboard();

    let text = `💳 <b>Pending Deposits & Verifications (${pendingIntents.length})</b>\n\n`;
    if (!pendingIntents.length) {
      text += `✅ <i>No unverified deposits pending review.</i>`;
    } else {
      for (const intent of pendingIntents.slice(0, 5)) {
        text += `• <b>Intent:</b> <code>${intent.id}</code>\n  Method: <b>${intent.provider}</b> | $${intent.amount.toFixed(2)} ${intent.asset}\n  Status: <i>${intent.status}</i>\n${intent.txHash ? `  TxID: <code>${intent.txHash}</code>\n` : ''}\n`;
      }
    }
    kb.row(adminPortalBtn('📱 Open Payments Portal', '/payments'));

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Command: /stock (Low-stock vault levels)
  adminBot.command('stock', async (ctx) => {
    const storeName = await getAdminStoreName();
    if (!(await isAuthorizedAdmin(ctx.from!.id))) {
      await ctx.reply(`⛔ <b>Access Denied:</b> This bot is strictly reserved for ${storeName} administrators.`, { parse_mode: 'HTML' });
      return;
    }
    const lowStockItems: Array<{ id: string; title: string; count: number }> = [];
    const allProds = store.allProducts();

    for (const p of allProds) {
      const avail = store.vaultAvailable(p.id);
      if (avail < 5) {
        lowStockItems.push({ id: p.id, title: p.title, count: avail });
      }
    }

    const kb = new InlineKeyboard().row(adminPortalBtn('➕ Restock in Admin Portal', '/products'));
    let text = `⚠️ <b>Vault Stock Monitoring</b>\n\n`;
    if (lowStockItems.length === 0) {
      text += `✅ <i>All products have sufficient vault inventory (>= 5 pcs).</i>`;
    } else {
      text += `🚨 <b>Low Stock Items:</b>\n\n`;
      for (const item of lowStockItems) {
        text += `• <b>${item.title}</b>: <code>${item.count} pcs left</code>\n`;
      }
      text += `\n<i>Tap below to upload and restock credentials.</i>`;
    }

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // Command: /id (Inspect chat ID for easy admin config)
  adminBot.command('id', async (ctx) => {
    const isAuth = await isAuthorizedAdmin(ctx.from!.id);
    await ctx.reply(
      `👤 <b>Telegram ID Information:</b>\n\n` +
      `🆔 <b>User ID:</b> <code>${ctx.from!.id}</code>\n` +
      `💬 <b>Chat ID:</b> <code>${ctx.chat.id}</code>\n` +
      `🛡️ <b>Admin Status:</b> ${isAuth ? '✅ Authorized Admin' : '❌ Unauthorized'}\n\n` +
      `<i>Add this ID to ADMIN_TG_IDS in your environment variables to grant access.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // Inline callback handlers for Payment Review alerts (approve: & reject:)
  adminBot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: '⛔ Unauthorized', show_alert: true });
      return;
    }
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery({ text: '🚀 Approving order and auto-delivering credentials…' });
    try {
      const res = await fulfillOrder(orderId);
      await ctx.reply(
        `✅ <b>Order Approved & Dispatched!</b>\n\n` +
        `📦 <b>Order ID:</b> <code>${orderId}</code>\n` +
        `Status: <b>${res.status}</b>\n` +
        `📬 Customer has received their digital credentials in DM.`,
        { parse_mode: 'HTML' }
      );
    } catch (e: any) {
      await ctx.reply(`⚠️ <b>Error approving order:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
  });

  adminBot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
    if (!(await isAuthorizedAdmin(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: '⛔ Unauthorized', show_alert: true });
      return;
    }
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery({ text: '❌ Order marked as rejected.' });
    store.setOrderStatus(orderId, 'CANCELLED');
    const it = store.allIntents().find((i) => i.orderId === orderId);
    if (it) store.setIntent(it.id, { status: 'CANCELLED' });

    await ctx.reply(`❌ <b>Order ${orderId} has been marked as REJECTED.</b>`, { parse_mode: 'HTML' });
  });

  adminBot.catch((e) => console.error('[Admin Bot] Error:', e));

  // Initialize Admin Menu Button & Commands
  adminBot.start({
    onStart: async (info) => {
      const storeName = await getAdminStoreName();
      console.log(`[Admin Bot] Connected and running for ${storeName} as @${info.username}!`);
      try {
        if (ADMIN_PORTAL_URL.startsWith('https://')) {
          await adminBot.api.setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '🛠️ Admin Portal',
              web_app: { url: ADMIN_PORTAL_URL },
            },
          });
        }
        await adminBot.api.setMyCommands([
          { command: 'admin', description: 'Admin Operations Hub & Mini App' },
          { command: 'stats', description: 'Real-Time Sales & Revenue Analytics' },
          { command: 'orders', description: 'Pending Orders & 1-Tap Fulfillment' },
          { command: 'deposits', description: 'Pending Deposits Verification' },
          { command: 'stock', description: 'Vault Stock & Low Stock Items' },
          { command: 'id', description: 'Check Telegram Chat ID' },
        ]);
      } catch (err) {
        console.warn('[Admin Bot] Notice while configuring commands:', err);
      }
    },
  });
}
