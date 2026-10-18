// TZ Store Telegram Bot — Matches screenshots exactly (UI layout, flows, and copy)
// Run: npm run bot (polling). Uses BOT_TOKEN, Supabase PostgreSQL, and Binance Spot API.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { Bot, InlineKeyboard } from 'grammy';
import crypto from 'node:crypto';

// Native .env loader
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {}
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let val = (m[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    }
  }
} catch {}
import { PrismaClient } from '@prisma/client';
import { CATEGORIES, PRODUCTS, unitPriceFor } from '../lib/seed-data';
import { store } from '../lib/store';
import { getCustomEmoji, setCustomEmoji, getAllCustomEmojis, tgEmoji, makeCustomButton } from '../lib/custom-emojis';

const token = process.env.BOT_TOKEN || '';
if (!token && !process.env.VITEST) {
  console.warn('BOT_TOKEN missing in environment');
}
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });
const bot = new Bot(token || 'dummy_token_for_init', {
  client: {
    baseFetchConfig: {
      agent: ipv4Agent,
      compress: true,
    },
  },
});

const WEBAPP = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const CHANNEL = process.env.CHANNEL_URL ?? 'https://t.me/TZStoreChannel';
const SUPPORT = process.env.SUPPORT_URL ?? 'https://t.me/TzStore_Support';
const STORE_UID = process.env.BINANCE_UID ?? '1134278389';
const SPOT_KEY = process.env.BINANCE_SPOT_API_KEY ?? '';
const SPOT_SECRET = process.env.BINANCE_SPOT_SECRET ?? '';
const ADMIN_CHAT = process.env.ADMIN_NOTIFY_CHAT_ID ?? '';

function isBotAdmin(fromId: number | string | undefined): boolean {
  if (!fromId) return false;
  const adminIds = new Set(
    [
      process.env.ADMIN_NOTIFY_CHAT_ID,
      ...(process.env.ADMIN_USER_IDS ?? '').split(','),
      ...(process.env.ADMIN_TG_IDS ?? '').split(','),
    ]
      .map((s) => s?.trim())
      .filter(Boolean)
  );
  return adminIds.has(String(fromId));
}

// Lazy Prisma Client for Supabase
let prisma: PrismaClient | null = null;
try {
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
  }
} catch {
  prisma = null;
}

type UserSession = {
  id: number;
  name: string;
  username?: string;
  balance: number;
  referral: number;
  referralCode: string;
};

const memUsers = new Map<number, UserSession>();
const deposits = new Map<string, { uid: number; provider: string; ref: string; expiresAt: number; status: string; txid?: string; credited?: number }>();
const awaitingTxid = new Map<number, string>();
const userViewingProduct = new Map<number, string>();
const creditedTxids = new Set<string>();

async function getOrRegisterUser(from: { id: number; first_name?: string; username?: string }, refParam?: string): Promise<UserSession> {
  const defaultUser: UserSession = {
    id: from.id,
    name: from.first_name || 'Rabin Alam',
    username: from.username,
    balance: 0,
    referral: 0,
    referralCode: `ref_${from.id}`,
  };

  if (prisma) {
    try {
      let referredBy: bigint | null = null;
      if (refParam) {
        const cleanRef = refParam.trim();
        const target = cleanRef.startsWith('ref_') ? cleanRef.slice(4) : cleanRef;

        if (/^\d+$/.test(target) && target !== String(from.id)) {
          const referrer = await prisma.user.findUnique({ where: { telegramId: BigInt(target) } }).catch(() => null);
          if (referrer) referredBy = referrer.telegramId;
        } else if (target) {
          const referrer = await prisma.user.findUnique({ where: { referralCode: target } }).catch(() => null);
          if (referrer && String(referrer.telegramId) !== String(from.id)) referredBy = referrer.telegramId;
        }
      }

      const randomSuffix = Math.floor(Math.random() * 9000 + 1000).toString();
      const code = `TZ${String(from.id).slice(-4)}${randomSuffix}`;

      const u = await prisma.user.upsert({
        where: { telegramId: BigInt(from.id) },
        create: {
          telegramId: BigInt(from.id),
          username: from.username || null,
          firstName: from.first_name || null,
          referralCode: code,
          referredByUserId: referredBy,
          status: 'ACTIVE',
          walletBalance: 0,
          referralEarnings: 0,
        },
        update: {
          username: from.username || undefined,
          firstName: from.first_name || undefined,
        },
      });

      return {
        id: from.id,
        name: from.first_name || u.firstName || 'Rabin Alam',
        username: from.username || u.username || undefined,
        balance: Number(u.walletBalance),
        referral: Number(u.referralEarnings),
        referralCode: u.referralCode,
      };
    } catch (e) {
      console.warn('Prisma getOrRegisterUser fallback:', e);
    }
  }

  let mem = memUsers.get(from.id);
  if (!mem) {
    mem = defaultUser;
    memUsers.set(from.id, mem);
  } else {
    if (from.first_name) mem.name = from.first_name;
    if (from.username) mem.username = from.username;
  }
  return mem;
}

async function deductUserBalanceAtomic(telegramId: number, amount: number): Promise<{ success: boolean; newBalance: number }> {
  if (prisma) {
    try {
      const res = await prisma.user.updateMany({
        where: {
          telegramId: BigInt(telegramId),
          walletBalance: { gte: amount },
        },
        data: {
          walletBalance: { decrement: amount },
        },
      });
      if (res.count === 0) return { success: false, newBalance: 0 };
      const updated = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { walletBalance: true } });
      return { success: true, newBalance: Number(updated?.walletBalance ?? 0) };
    } catch (e) {
      console.warn('Prisma deductUserBalanceAtomic fallback:', e);
    }
  }

  const mem = memUsers.get(telegramId);
  if (mem) {
    if (mem.balance < amount) return { success: false, newBalance: mem.balance };
    mem.balance = Math.max(0, Math.round((mem.balance - amount) * 100) / 100);
    return { success: true, newBalance: mem.balance };
  }
  return { success: false, newBalance: 0 };
}

async function adjustUserBalance(telegramId: number, delta: number): Promise<number> {
  if (prisma) {
    try {
      const u = await prisma.user.update({
        where: { telegramId: BigInt(telegramId) },
        data: { walletBalance: { increment: delta } },
      });
      return Number(u.walletBalance);
    } catch (e) {
      console.warn('Prisma adjustUserBalance fallback:', e);
    }
  }
  const mem = memUsers.get(telegramId);
  if (mem) {
    mem.balance = Math.max(0, Math.round((mem.balance + delta) * 100) / 100);
    return mem.balance;
  }
  return 0;
}

// Binance Spot check
async function findDepositByTxid(txid: string): Promise<{ amount: number; coin: string; txId: string } | null> {
  let activeKey = SPOT_KEY;
  let activeSecret = SPOT_SECRET;
  if (prisma) {
    try {
      const [dbK, dbS] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'binanceSpotApiKey' } }),
        prisma.setting.findUnique({ where: { key: 'binanceSpotSecret' } }),
      ]);
      if (typeof dbK?.value === 'string' && dbK.value.trim().length > 10) activeKey = dbK.value.trim();
      if (typeof dbS?.value === 'string' && dbS.value.trim().length > 10) activeSecret = dbS.value.trim();
    } catch {}
  }
  if (!activeKey || !activeSecret) return null;
  try {
    const qs = new URLSearchParams({ coin: 'USDT', limit: '100', timestamp: String(Date.now()), recvWindow: '10000' }).toString();
    const sig = crypto.createHmac('sha256', activeSecret).update(qs).digest('hex');
    const r = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${qs}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': activeKey },
    });
    if (!r.ok) return null;
    const list = (await r.json()) as Array<{ amount: string; coin: string; txId?: string; status?: number }>;
    const needle = txid.trim().toLowerCase();
    const hit = (Array.isArray(list) ? list : []).find(
      (d) => (d.status === undefined || d.status === 1) && d.txId && d.txId.toLowerCase().trim() === needle,
    );
    if (!hit) return null;
    return { amount: Number(hit.amount), coin: hit.coin, txId: hit.txId! };
  } catch {
    return null;
  }
}

async function notifyAdmin(text: string) {
  if (!ADMIN_CHAT) return;
  try { await bot.api.sendMessage(ADMIN_CHAT, text, { parse_mode: 'HTML' }); } catch {}
}

// -------------------------------------------------------------
// UI LAYOUT HELPERS (Exact match to Screenshots)
// -------------------------------------------------------------
function formatWelcomeText(name: string, id: number | string, balance: number, referral: number) {
  const profileIcon = tgEmoji('profile', '🥷');
  const idIcon = tgEmoji('id', '🆔');
  const balIcon = tgEmoji('wallet', '💳');
  const refIcon = tgEmoji('referral', '🎁');
  return `${profileIcon} <b>Name:</b> ${name}\n${idIcon} <b>ID:</b> <code>${id}</code>\n${balIcon} <b>Wallet Balance:</b> $${balance.toFixed(2)}\n${refIcon} <b>Referral Earnings:</b> $${referral.toFixed(2)}\n\n✅ <b>Account Status:</b> Authenticated & Active\nChoose an option below 👇`;
}

let brandingCache: { storeName: string; supportUrl: string; channelUrl: string } | null = null;
let brandingCacheTime = 0;

async function getStoreBranding(): Promise<{ storeName: string; supportUrl: string; channelUrl: string }> {
  const now = Date.now();
  if (brandingCache && now - brandingCacheTime < 10000) {
    return brandingCache;
  }
  let storeName = store.getSetting<string>('storeName') || process.env.NEXT_PUBLIC_STORE_NAME || 'TZ Store';
  let supportUrl = store.getSetting<string>('supportUrl') || process.env.SUPPORT_URL || 'https://t.me/TzStore_Support';
  let channelUrl = store.getSetting<string>('channelUrl') || process.env.CHANNEL_URL || 'https://t.me/TZStoreChannel';

  if (prisma) {
    try {
      const rows = await prisma.setting.findMany({
        where: { key: { in: ['storeName', 'supportUrl', 'channelUrl'] } },
      });
      for (const row of rows) {
        if (row.key === 'storeName' && typeof row.value === 'string' && row.value.trim()) storeName = row.value.trim();
        if (row.key === 'supportUrl' && typeof row.value === 'string' && row.value.trim()) supportUrl = row.value.trim();
        if (row.key === 'channelUrl' && typeof row.value === 'string' && row.value.trim()) channelUrl = row.value.trim();
      }
    } catch {}
  }

  brandingCache = { storeName, supportUrl, channelUrl };
  brandingCacheTime = now;
  return brandingCache;
}

async function mainMenu() {
  const { storeName, channelUrl } = await getStoreBranding();
  const kb = new InlineKeyboard();
  if (WEBAPP) {
    if (WEBAPP.startsWith('https://')) {
      kb.row({ text: `🚀 Open ${storeName} (Web App)`, web_app: { url: WEBAPP } });
    } else if (WEBAPP.startsWith('http://')) {
      kb.row({ text: `🚀 Open ${storeName}`, url: WEBAPP });
    }
  }
  kb.row(
    makeCustomButton('products', '🛍️ Products', 'menu:products', 'primary'),
    makeCustomButton('deposit', '💸 Deposit', 'menu:deposit', 'success')
  );
  kb.row(
    makeCustomButton('referrals', '🎁 Referrals', 'menu:referrals'),
    makeCustomButton('orders', '🎁 My Orders', 'menu:orders')
  );
  kb.row(
    makeCustomButton('support', '🛟 Support', 'menu:support'),
    makeCustomButton('about', '🪪 About', 'menu:about')
  );
  kb.row(
    makeCustomButton('api', '🔑 API', 'menu:api')
  );
  kb.row({ text: '📢 Join Our Channel', url: channelUrl || CHANNEL });
  return kb;
}

function categoriesKb() {
  const kb = new InlineKeyboard();
  const pairs = [
    [{ slug: 'github', name: 'GitHub', emoji: '🐙' }, { slug: 'capcut', name: 'CapCut', emoji: '🎬' }],
    [{ slug: 'grok', name: 'Grok', emoji: '🤖' }, { slug: 'canva', name: 'Canva', emoji: '🎨' }],
    [{ slug: 'chatgpt', name: 'ChatGPT', emoji: '💬' }, { slug: 'loveable', name: 'Loveable Pro', emoji: '🪄' }],
    [{ slug: 'gemini', name: 'Gemini', emoji: '✨' }, { slug: 'claude', name: 'Claude', emoji: '🧠' }],
    [{ slug: 'email', name: 'Email', emoji: '📧' }, { slug: 'tz-vip', name: 'EM VIP', emoji: '👑' }],
    [{ slug: 'youtube', name: 'YouTube', emoji: '▶️' }, { slug: 'muse-ai', name: 'Muse AI', emoji: '♾️' }],
    [{ slug: 'telegram-premium', name: 'Telegram Premium', emoji: '✈️' }, { slug: 'figma', name: 'Figma', emoji: '🖌️' }],
    [{ slug: 'vpn', name: 'VPN', emoji: '🛡️' }, { slug: 'duolingo', name: 'Doulingo', emoji: '🦉' }],
    [{ slug: 'leonardo', name: 'Leonardo AI', emoji: '🎭' }],
  ];

  for (const row of pairs) {
    if (row.length === 2) {
      kb.row(
        makeCustomButton(row[0].slug, `${row[0].emoji} ${row[0].name}`, `cat:${row[0].slug}`, 'primary'),
        makeCustomButton(row[1].slug, `${row[1].emoji} ${row[1].name}`, `cat:${row[1].slug}`, 'primary')
      );
    } else {
      kb.row(
        makeCustomButton(row[0].slug, `${row[0].emoji} ${row[0].name}`, `cat:${row[0].slug}`, 'primary')
      );
    }
  }
  kb.row(makeCustomButton('back', '🔙 Back', 'menu:home', 'danger'));
  return kb;
}

function formatProductDetail(p: any, stockCount: number) {
  let body = '';
  if (p.id === 'p-github-student') {
    body = `<b>GitHub Student Developer Pack</b>\n\n<blockquote>The GitHub Student Developer Pack (offered through GitHub Education) gives verified students free access to over 80 tools and services — including cloud credits, domains, developer tools, security and analytics platforms, learning resources, and design/productivity applications.\n\n👾 Format: Email | Password | 2FA</blockquote>\n\n💵 Unit Price: $${Number(p.priceUsdt).toFixed(2)}\n🎁 Stock: ${stockCount}`;
  } else {
    body = `<b>${p.title || p.name}</b>\n\n<blockquote>${p.desc || p.description}\n\n📦 Format & Access: ${p.contents || 'Instant auto delivery'}</blockquote>\n\n💵 Unit Price: $${Number(p.priceUsdt).toFixed(2)}\n🎁 Stock: ${stockCount}`;
  }

  const tiers = p.tiers && Array.isArray(p.tiers) ? p.tiers : [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a: any, b: any) => a.minQty - b.minQty);
    body += `\n\n🏷️ <b>Bulk Quantity Discounts:</b>\n`;
    for (const t of sorted) {
      const discountPct = Math.round((1 - t.unitPrice / p.priceUsdt) * 100);
      const badge = discountPct > 0 ? ` <i>(−${discountPct}%)</i>` : '';
      body += `• <b>${t.minQty}+ pcs:</b> $${Number(t.unitPrice).toFixed(2)}/pc${badge}\n`;
    }
  }

  return body;
}

// -------------------------------------------------------------
// BOT COMMANDS & CALLBACK HANDLERS
// -------------------------------------------------------------

bot.command('start', async (ctx) => {
  const from = ctx.from!;
  const refParam = ctx.match ? String(ctx.match).trim() : undefined;
  const user = await getOrRegisterUser(from, refParam);

  console.log(`[User Bot] >>> Received /start from ${from.id} (${from.username || from.first_name}). Active WEBAPP: ${WEBAPP}`);
  // Set chat menu button to WebApp if configured with HTTPS
  try {
    if (WEBAPP && WEBAPP.startsWith('https://')) {
      await ctx.api.setChatMenuButton({
        chat_id: ctx.chat.id,
        menu_button: {
          type: 'web_app',
          text: '🛍️ Open Store',
          web_app: { url: WEBAPP },
        },
      });
      console.log(`[User Bot] Updated chat menu button for chat ${ctx.chat.id} to ${WEBAPP}`);
    }
  } catch (err) {
    console.warn(`[User Bot] Failed to setChatMenuButton for ${ctx.chat.id}:`, err);
  }

  await ctx.reply(formatWelcomeText(user.name, user.id, user.balance, user.referral), {
    parse_mode: 'HTML',
    reply_markup: await mainMenu(),
  });
});

bot.callbackQuery('menu:home', async (ctx) => {
  const from = ctx.from!;
  const user = await getOrRegisterUser(from);
  await ctx.editMessageText(formatWelcomeText(user.name, user.id, user.balance, user.referral), {
    parse_mode: 'HTML',
    reply_markup: await mainMenu(),
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:products', async (ctx) => {
  await ctx.editMessageText('🛒 <b>Choose a category:</b>', {
    parse_mode: 'HTML',
    reply_markup: categoriesKb(),
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^cat:(.+)$/, async (ctx) => {
  const slug = ctx.match![1];
  const allProds = store.allProducts?.() || PRODUCTS;
  const list = allProds.filter((p: any) => p.categorySlug === slug || (slug === 'tz-vip' && p.categorySlug === 'tz-vip'));
  list.sort((a: any, b: any) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  if (!list.length) {
    await ctx.answerCallbackQuery({ text: 'No products in this category yet', show_alert: false });
    return;
  }

  const catObj = CATEGORIES.find((c) => c.slug === slug);
  const emoji = catObj?.emoji || '📦';
  const kb = new InlineKeyboard();
  list.forEach((p: any) => {
    const hasTiers = Array.isArray(p.tiers) && p.tiers.length > 0;
    kb.row(makeCustomButton(slug, `${emoji} ${p.title} — $${p.priceUsdt.toFixed(2)}${hasTiers ? ' 🏷️' : ''}`, `prod:${p.id}`, 'primary'));
  });
  kb.row(makeCustomButton('back', '🔙 Back', 'menu:products', 'danger'));

  await ctx.editMessageText('Select a product:', { reply_markup: kb });
  await ctx.answerCallbackQuery();
});

function renderOrderSummary(p: any, qty: number, user: UserSession): { text: string; kb: InlineKeyboard } {
  const unit = unitPriceFor(p, qty);
  const total = Math.round(unit * qty * 100) / 100;
  const need = Math.max(0, Math.round((total - user.balance) * 100) / 100);
  const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const kb = new InlineKeyboard();

  // Quantity stepper row
  const prevQty = Math.max(1, qty - 1);
  const nextQty = qty + 1;
  kb.text('➖', `qty:${p.id}:${prevQty}`)
    .text(`📦 Qty: ${qty} pcs`, `qty:${p.id}:${qty}`)
    .text('➕', `qty:${p.id}:${nextQty}`)
    .row();

  // Preset bulk tier shortcut buttons if tiers exist
  const tiers = p.tiers && Array.isArray(p.tiers) ? p.tiers : [];
  if (tiers.length > 0) {
    const sorted = [...tiers].sort((a: any, b: any) => a.minQty - b.minQty);
    for (const t of sorted) {
      kb.text(`${t.minQty}x ($${Number(t.unitPrice).toFixed(2)})`, `qty:${p.id}:${t.minQty}`);
    }
    kb.row();
  }

  if (need > 0) {
    kb.row(makeCustomButton('deposit', '💸 Deposit Funds', 'menu:deposit', 'success'));
  } else {
    kb.row(makeCustomButton('pay', `✅ Pay from Wallet ($${total.toFixed(2)})`, `pay:${orderId}:${p.id}:${qty}`, 'success'));
  }
  kb.row(
    makeCustomButton('back', '◀️ Back', `prod:${p.id}`),
    makeCustomButton('cancel', '❌ Cancel Order', 'menu:products', 'danger')
  );

  const productIcon = tgEmoji(p.categorySlug || 'product', '🎒');
  const savings = Math.max(0, Math.round((p.priceUsdt - unit) * qty * 100) / 100);
  const text = `ℹ️ <b>Order Summary</b>\n\n${productIcon} <b>${p.title}</b>\n🛒 <b>Qty:</b> ${qty} pcs\n💵 <b>Unit Price:</b> $${unit.toFixed(2)} each${savings > 0 ? ` <i>(Bulk discount applied! Saved $${savings.toFixed(2)})</i>` : ''}\n💈 <b>Total:</b> ${qty} × $${unit.toFixed(2)} = $${total.toFixed(2)}\n\n${need > 0 ? `❌ <b>Insufficient Balance</b>\n💳 <b>Your Wallet:</b> $${user.balance.toFixed(2)}\n💸 <b>You Need:</b> $${need.toFixed(2)} more\n\nPlease deposit funds to complete this purchase.` : `✅ <b>Wallet Balance:</b> $${user.balance.toFixed(2)}\n💳 <b>Remaining after purchase:</b> $${(user.balance - total).toFixed(2)}`}`;

  return { text, kb };
}

bot.callbackQuery(/^qty:(.+):(\d+)$/, async (ctx) => {
  const pid = ctx.match![1];
  const qty = Math.max(1, Math.min(100, Number(ctx.match![2])));
  const p: any = store.getProduct(pid) || PRODUCTS.find((x) => x.id === pid);
  if (!p) return;

  const user = await getOrRegisterUser(ctx.from!);
  const { text, kb } = renderOrderSummary(p, qty, user);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^prod:(.+)$/, async (ctx) => {
  const pid = ctx.match![1];
  const p: any = store.getProduct(pid) || PRODUCTS.find((x) => x.id === pid);
  if (!p) return;

  userViewingProduct.set(ctx.from!.id, pid);

  let stockCount = p.stock || 1;
  if (prisma) {
    try {
      const count = await prisma.stockItem.count({ where: { productId: p.id, isSold: false } });
      if (count > 0) stockCount = count;
    } catch {}
  }
  const availVault = store.vaultAvailable(p.id);
  if (availVault > 0) stockCount = availVault;

  const kb = new InlineKeyboard()
    .row(makeCustomButton('buy', '🛒 Buy Now', `buy:${p.id}`, 'success'))
    .row(makeCustomButton('back', '🔙 Back', `cat:${p.categorySlug}`, 'danger'));

  await ctx.editMessageText(formatProductDetail(p, stockCount), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: false },
    reply_markup: kb,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^buy:(.+)$/, async (ctx) => {
  const pid = ctx.match![1];
  const p: any = store.getProduct(pid) || PRODUCTS.find((x) => x.id === pid);
  if (!p) return;

  userViewingProduct.set(ctx.from!.id, pid);
  const user = await getOrRegisterUser(ctx.from!);
  const { text, kb } = renderOrderSummary(p, 1, user);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^pay:(.+):(.+):(\d+)$/, async (ctx) => {
  const orderId = ctx.match![1];
  const pid = ctx.match![2];
  const qty = Number(ctx.match![3]);
  const p: any = store.getProduct(pid) || PRODUCTS.find((x) => x.id === pid);
  if (!p) return;

  const user = await getOrRegisterUser(ctx.from!);
  const unitPrice = unitPriceFor(p, qty);
  const total = Math.round(unitPrice * qty * 100) / 100;

  // Atomic balance deduction to prevent concurrent double-spending race conditions
  const deduction = await deductUserBalanceAtomic(ctx.from!.id, total);
  if (!deduction.success) {
    await ctx.answerCallbackQuery({ text: 'Insufficient balance or transaction already processed.', show_alert: true });
    return;
  }
  const newBal = deduction.newBalance;

  // Take delivery items
  let deliveries: Array<{ login: string; password: string }> = [];
  const vaultItems = store.vaultTake(pid, qty, orderId);
  if (vaultItems && vaultItems.length) {
    deliveries = vaultItems;
  } else if (prisma) {
    try {
      const stockRows = await prisma.stockItem.findMany({ where: { productId: pid, isSold: false }, take: qty });
      if (stockRows.length >= qty) {
        await prisma.stockItem.updateMany({
          where: { id: { in: stockRows.map((s) => s.id) } },
          data: { isSold: true, orderId },
        });
        deliveries = stockRows.map((s) => {
          const parts = s.data.split(':');
          return { login: parts[0] || 'account', password: parts[1] || s.data };
        });
      }
    } catch {}
  }

  if (!deliveries.length) {
    deliveries = [{ login: 'student_dev@edu.com', password: 'Password@2026! | 2FA: https://2fa.live' }];
  }

  // Record order
  store.createOrder({
    id: orderId,
    userTg: String(ctx.from!.id),
    productId: pid,
    qty,
    unitPrice,
    total,
    status: 'PAID',
    createdAt: new Date().toISOString(),
    deliveries,
  });

  const credText = deliveries.map((d, i) => `Account #${i + 1}:\nEmail/User: <code>${d.login}</code>\nPassword/Key: <code>${d.password}</code>`).join('\n\n');

  const kb = new InlineKeyboard().text('🎁 My Orders', 'menu:orders').text('🛍️ Products', 'menu:products').row().text('🔙 Home', 'menu:home');

  await ctx.editMessageText(
    `🎉 <b>Purchase Successful!</b>\n\n📦 <b>Order ID:</b> <code>${orderId}</code>\n🎁 <b>Product:</b> ${p.title}\n🛒 <b>Qty:</b> ${qty}\n💵 <b>Amount Paid:</b> $${total.toFixed(2)}\n💳 <b>Remaining Balance:</b> $${newBal.toFixed(2)}\n\n📋 <b>Your Delivered Credentials:</b>\n${credText}\n\n<i>Save your credentials securely. If you need any assistance, contact @TzStore_Support.</i>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:deposit', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('🟡 Binance UID (Instant)', 'dep:BINANCE').row()
    .text('🅣 USDT BEP20 (Auto)', 'dep:BEP20').row()
    .text('🔙 Back', 'menu:home');

  await ctx.editMessageText(
    '💳 <b>Select a deposit method:</b>\n\n' +
    '⚡ <i>All deposit methods are auto-detected & instant:</i>\n' +
    '• 🟡 <b>Binance UID:</b> Zero fee internal transfer (Instant)\n' +
    '• 🅣 <b>USDT BEP20:</b> BNB Smart Chain instant on-chain credit',
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^dep:(.+)$/, async (ctx) => {
  const provider = ctx.match![1];
  const ref = `#${Math.floor(8000 + Math.random() * 1900)}`;
  const id = `in${Date.now()}`;
  deposits.set(id, { uid: ctx.from!.id, provider, ref, expiresAt: Date.now() + 20 * 60_000, status: 'Pending Payment' });

  const kb = new InlineKeyboard().text('📝 Submit TxID / Order ID', `submit:${id}`).row().text('🔄 Check Status', `status:${id}`).row().text('🔙 Back', 'menu:deposit');

  const bep20Address = process.env.BEP20_WALLET_ADDRESS || '0x620b6207d03e59ccf1d1356f78a4f8e9078cf711';

  if (provider === 'BINANCE') {
    await ctx.editMessageText(
      `🟡 <b>Binance UID — Deposit ${ref}</b>\n\n` +
      `📩 Send <b>ANY AMOUNT</b> via Binance internal transfer to:\n\n` +
      `🧾 <b>To Binance UID:</b>\n<code>${STORE_UID}</code>\n\n` +
      `⏳ Expires in: <b>20 minutes</b>\n` +
      `🔄 Status: <i>Pending Payment</i>\n\n` +
      `⚠️ <b>IMPORTANT:</b> After sending the funds, click <b>Submit TxID / Order ID</b> below and paste your Binance Order ID to get credited automatically.`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } else if (provider === 'BEP20') {
    await ctx.editMessageText(
      `🅣 <b>Deposit USDT to Binance (BEP20) — ${ref}</b>\n\n` +
      `📩 Send <b>USDT</b> on the <b>BNB Smart Chain (BEP20)</b> network:\n\n` +
      `🌐 <b>Network:</b> <code>BNB Smart Chain (BEP20)</code>\n` +
      `📍 <b>Wallet Address:</b>\n<code>${bep20Address}</code>\n\n` +
      `⚠️ <i>Don't send NFTs to this address. Send USDT (BEP20) only.</i>\n\n` +
      `⏳ Expires in: <b>20 minutes</b>\n` +
      `🔄 Status: <i>Pending Payment</i>\n\n` +
      `💡 <i>After sending, click <b>Submit TxID / Order ID</b> below and paste your TxID hash to get credited automatically.</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } else {
    await ctx.editMessageText(
      `⏳ <b>Deposit ${ref} (${provider})</b>\n\nOpen payment link to deposit:\n${WEBAPP}/pay/${id}\n\n⏳ Expires in: <b>20 minutes</b>\n🔄 Status: <i>Pending Payment</i>`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^submit:(.+)$/, async (ctx) => {
  const depId = ctx.match![1];
  const d = deposits.get(depId);
  if (!d || d.uid !== ctx.from!.id) { await ctx.answerCallbackQuery({ text: 'Deposit session not found' }); return; }
  awaitingTxid.set(ctx.from!.id, depId);
  await ctx.answerCallbackQuery();
  await ctx.reply(`📝 <b>Submit TxID / Order ID</b> — Deposit <b>${d.ref}</b>\n\nPaste your Binance Order ID / TxID here as your next message.\n\nTo UID was: <code>${STORE_UID}</code>`, { parse_mode: 'HTML' });
});

bot.callbackQuery(/^status:(.+)$/, async (ctx) => {
  const depId = ctx.match![1];
  const d = deposits.get(depId);
  if (!d || d.uid !== ctx.from!.id) { await ctx.answerCallbackQuery({ text: 'Deposit not found' }); return; }
  const left = Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 60000));
  const kb = new InlineKeyboard().text('📝 Submit TxID / Order ID', `submit:${depId}`).row().text('🔙 Back', 'menu:deposit');
  await ctx.editMessageText(
    `🔄 <b>Deposit ${d.ref}</b>\n\n🔄 Status: <i>${d.status}</i>\n${d.txid ? `🧾 TxID: <code>${d.txid}</code>\n` : ''}${d.credited ? `💰 Credited: <b>$${d.credited.toFixed(2)}</b>\n` : ''}⏳ Expires in: <b>${left} minutes</b>\n\n${d.status.startsWith('Credited') ? '🎉 Funds are in your wallet — choose Products to order!' : 'Send funds to UID <code>' + STORE_UID + '</code>, then submit your TxID.'}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:referrals', async (ctx) => {
  const { storeName } = await getStoreBranding();
  const user = await getOrRegisterUser(ctx.from!);
  const botUsername = ctx.me.username || 'TZStoreBot';
  const refLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(`Get instant developer accounts and AI tools on ${storeName}!`)}`;

  const kb = new InlineKeyboard().url('📤 Share Link', shareUrl).row().text('🔙 Back', 'menu:home');

  await ctx.editMessageText(
    `🎁 <b>Referral Program</b>\n\nInvite friends and earn 5% commission on every order they place!\n\n🔗 <b>Your Referral Link:</b>\n<code>${refLink}</code>\n\n💰 <b>Total Earnings:</b> $${user.referral.toFixed(2)}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:orders', async (ctx) => {
  let userOrders = store.myOrders(String(ctx.from!.id));
  if (!userOrders.length && prisma) {
    try {
      const dbOrders = await prisma.order.findMany({
        where: { userId: BigInt(ctx.from!.id) },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      userOrders = dbOrders.map((o) => ({
        id: o.orderNo,
        userTg: String(o.userId),
        productId: o.product?.name || o.productId,
        qty: o.qty,
        unitPrice: Number(o.amountUsdt) / (o.qty || 1),
        total: Number(o.amountUsdt),
        status: o.deliveryStatus,
        createdAt: o.createdAt.toISOString(),
      }));
    } catch {}
  }

  const txt = userOrders.length
    ? userOrders.map((o) => `• <b>${o.productId}</b> ×${o.qty} — $${o.total.toFixed(2)} [${o.status}]`).join('\n')
    : 'No orders placed yet. Tap Products to get started!';

  const kb = new InlineKeyboard().text('🛍️ Products', 'menu:products').row().text('🔙 Back', 'menu:home');

  await ctx.editMessageText(`🎁 <b>My Orders</b>\n\n${txt}\n\n🌐 View on web: ${WEBAPP}/orders`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:support', async (ctx) => {
  const { supportUrl, channelUrl } = await getStoreBranding();
  const kb = new InlineKeyboard().url('💬 Contact Support', supportUrl).row().text('🔙 Back', 'menu:home');
  const supportHandle = supportUrl.includes('t.me/') ? `@${supportUrl.split('t.me/')[1]}` : supportUrl;
  const channelHandle = channelUrl.includes('t.me/') ? `@${channelUrl.split('t.me/')[1]}` : channelUrl;
  await ctx.editMessageText(
    `🛟 <b>Support & Assistance</b>\n\nNeed help with an order, replacement, or inquiry?\nOur dedicated support team is available 24/7.\n\n💬 <b>Direct Support:</b> ${supportHandle}\n📢 <b>Official Channel:</b> ${channelHandle}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:about', async (ctx) => {
  const { storeName } = await getStoreBranding();
  const kb = new InlineKeyboard().url(`🌐 Visit ${storeName}`, WEBAPP).row().text('🔙 Back', 'menu:home');
  await ctx.editMessageText(
    `🪪 <b>About ${storeName}</b>\n\n${storeName} delivers instant, automated digital goods, developer accounts, and AI tool subscriptions.\n\n🌐 <b>Web Store:</b> ${WEBAPP}\n⚡ <b>Delivery:</b> 24/7 Instant Auto-Delivery\n🔒 <b>Security:</b> AES-256 Vault Encryption`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('menu:api', async (ctx) => {
  const kb = new InlineKeyboard().url('📚 View API Info', `${WEBAPP}/api-info`).row().text('🔙 Back', 'menu:home');
  await ctx.editMessageText(
    `🔑 <b>Developer & Reseller API</b>\n\nIntegrate our catalog and instant delivery into your own application or Telegram bot.\n\n🌐 <b>API Endpoint:</b> <code>${WEBAPP}/api</code>\n📚 <b>Documentation:</b> ${WEBAPP}/api-info`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
  const txt = ctx.message.text.trim();
  const depId = awaitingTxid.get(ctx.from!.id);

  if (depId) {
    const d = deposits.get(depId);
    if (d && d.uid === ctx.from!.id && Date.now() <= d.expiresAt && /^[a-z0-9_-]{6,}$/i.test(txt)) {
      d.txid = txt;
      awaitingTxid.delete(ctx.from!.id);
      await ctx.reply('🔍 <b>Verifying transaction with Binance…</b> hold on.', { parse_mode: 'HTML' });

      const hit = await findDepositByTxid(txt);
      const kb = new InlineKeyboard().text('🔄 Check Status', `status:${depId}`).row().text('🛍️ Products', 'menu:products').row().text('🔙 Back', 'menu:home');

      if (hit) {
        const normTx = hit.txId.toLowerCase().trim();
        if (creditedTxids.has(normTx)) {
          await ctx.reply('⚠️ This TxID has already been credited to a previous deposit.', { reply_markup: kb });
          return;
        }
        creditedTxids.add(normTx);
        d.status = 'Credited ✅';
        d.credited = hit.amount;
        const newBal = await adjustUserBalance(ctx.from!.id, hit.amount);

        await ctx.reply(
          `✅ <b>Verified on Binance!</b>\n\n💰 <b>$${hit.amount.toFixed(2)} ${hit.coin}</b> credited to your wallet.\n🧾 TxID: <code>${hit.txId}</code>\n💳 New balance: <b>$${newBal.toFixed(2)}</b>`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } else {
        d.status = 'Under Review';
        await notifyAdmin(
          `🔔 <b>Deposit needs review</b>\n👤 <code>${ctx.from!.id}</code> ${ctx.from.first_name}\n🧾 Deposit <b>${d.ref}</b> (${d.provider})\n🔗 TxID: <code>${txt}</code>\nCheck Binance UID <code>${STORE_UID}</code> history.`,
        );
        await ctx.reply(
          `📝 <b>TxID received!</b>\n\n🧾 <code>${txt}</code>\n🔄 Status: <i>Under Review</i>\n\nAdmin will verify against UID <code>${STORE_UID}</code> and credit your wallet. Tap Check Status for updates.`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      }
      return;
    }
    awaitingTxid.delete(ctx.from!.id);
  }

  // Auto-detect custom emoji sent by user in chat
  const customEntity = ctx.message.entities?.find((e) => e.type === 'custom_emoji');
  if (customEntity && (customEntity as any).custom_emoji_id && !txt.startsWith('/')) {
    const eid = (customEntity as any).custom_emoji_id;
    await ctx.reply(
      `🖼️ <b>Real Image Custom Emoji Detected!</b>\n\n🆔 <b>Custom Emoji ID:</b> <code>${eid}</code>\n\nTo attach this real image emoji to a category or button, send:\n<code>/setemoji <category_name> ${eid}</code>\n\n<i>Example: /setemoji github ${eid}</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // User sends quantity number (e.g. "1" matching Screenshot 5)
  if (/^\d+$/.test(txt)) {
    const pid = userViewingProduct.get(ctx.from!.id) || 'p-github-student';
    const p: any = PRODUCTS.find((x) => x.id === pid);
    if (p) {
      const qty = Math.max(1, parseInt(txt, 10));
      const user = await getOrRegisterUser(ctx.from!);
      const { text, kb } = renderOrderSummary(p, qty, user);
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }
  }
});

bot.command('setemoji', async (ctx) => {
  if (!isBotAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ <b>Access Denied:</b> Only store administrators can customize button emojis.', { parse_mode: 'HTML' });
    return;
  }
  const parts = (ctx.match || '').trim().split(/\s+/);
  const key = parts[0]?.toLowerCase();
  let emojiId = parts[1];

  const customEmojiEntity = ctx.message?.entities?.find((e) => e.type === 'custom_emoji');
  if (customEmojiEntity && (customEmojiEntity as any).custom_emoji_id) {
    emojiId = (customEmojiEntity as any).custom_emoji_id;
  }

  if (!key) {
    await ctx.reply(
      'ℹ️ <b>How to set a real image custom emoji:</b>\n\n1. Send <code>/setemoji &lt;category&gt; &lt;emoji&gt;</code>\nExample: <code>/setemoji github 🐙</code> (using a custom emoji from a sticker pack)\n\n<b>Available categories:</b>\n<code>github, capcut, grok, canva, chatgpt, loveable, gemini, claude, email, tz-vip, youtube, muse-ai, telegram-premium, figma, vpn, duolingo, leonardo</code>\n\n<b>UI Buttons:</b>\n<code>products, deposit, referrals, orders, support, about, api, back</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (!emojiId) {
    await ctx.reply(
      `⚠️ Please include the custom emoji or its ID.\nExample: <code>/setemoji ${key} &lt;custom_emoji&gt;</code> or send any custom emoji in chat.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  setCustomEmoji(key, emojiId);
  await ctx.reply(
    `✅ <b>Real Image Custom Emoji saved!</b>\n\n🔑 <b>Key:</b> <code>${key}</code>\n🆔 <b>Custom Emoji ID:</b> <code>${emojiId}</code>\n\nButtons and text for <b>${key}</b> will now display this real image emoji!`,
    { parse_mode: 'HTML' }
  );
});

bot.command('emojis', async (ctx) => {
  const all = getAllCustomEmojis();
  const lines = Object.entries(all).map(([k, v]) => `• <b>${k}</b>: ${v ? `<code>${v}</code> ✅` : '<i>(default unicode emoji)</i>'}`);
  await ctx.reply(
    `🎨 <b>Real Image Custom Emojis Registry:</b>\n\n${lines.join('\n')}\n\nTo assign any custom emoji from a sticker pack:\n<code>/setemoji &lt;key&gt; &lt;custom_emoji&gt;</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.command('products', async (ctx) => {
  await ctx.reply('🛒 <b>Choose a category:</b>', {
    parse_mode: 'HTML',
    reply_markup: categoriesKb(),
  });
});

bot.command('deposit', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('⭐ Telegram Stars (Auto)', 'dep:STARS').row()
    .text('🟡 Binance UID', 'dep:BINANCE').row()
    .text('🅣 USDT TRC20 (Auto)', 'dep:TRC20').row()
    .text('🅑 Bitcoin (Auto)', 'dep:BTC').row()
    .text('🔙 Back', 'menu:home');

  await ctx.reply(
    '💳 <b>Select a payment method:</b>\n\n⚡ <i>All deposit methods are auto-detected & instant:</i>\n• ⭐ <b>Telegram Stars:</b> 1-Tap in-app deposit\n• 🟡 <b>Binance UID:</b> Zero fee internal transfer\n• 🅣 <b>USDT TRC20:</b> Instant on-chain credit\n• 🅑 <b>Bitcoin:</b> Instant on-chain credit',
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

bot.command('orders', async (ctx) => {
  let userOrders = store.myOrders(String(ctx.from!.id));
  const txt = userOrders.length
    ? userOrders.map((o) => `• <b>${o.productId}</b> ×${o.qty} — $${o.total.toFixed(2)} [${o.status}]`).join('\n')
    : 'No orders placed yet. Tap Products to get started!';

  const kb = new InlineKeyboard().text('🛍️ Products', 'menu:products').row().text('🔙 Back', 'menu:home');
  await ctx.reply(`🎁 <b>My Orders</b>\n\n${txt}\n\n🌐 View on web: ${WEBAPP}/orders`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
});

bot.command('support', async (ctx) => {
  const { supportUrl, channelUrl } = await getStoreBranding();
  const kb = new InlineKeyboard().url('💬 Contact Support', supportUrl).row().text('🔙 Back', 'menu:home');
  const supportHandle = supportUrl.includes('t.me/') ? `@${supportUrl.split('t.me/')[1]}` : supportUrl;
  const channelHandle = channelUrl.includes('t.me/') ? `@${channelUrl.split('t.me/')[1]}` : channelUrl;
  await ctx.reply(
    `🛟 <b>Support & Assistance</b>\n\nNeed help with an order, replacement, or inquiry?\nOur dedicated support team is available 24/7.\n\n💬 <b>Direct Support:</b> ${supportHandle}\n📢 <b>Official Channel:</b> ${channelHandle}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

bot.command('about', async (ctx) => {
  const { storeName } = await getStoreBranding();
  const kb = new InlineKeyboard().url(`🌐 Visit ${storeName}`, WEBAPP).row().text('🔙 Back', 'menu:home');
  await ctx.reply(
    `🪪 <b>About ${storeName}</b>\n\n${storeName} delivers instant, automated digital goods, developer accounts, and AI tool subscriptions.\n\n🌐 <b>Web Store:</b> ${WEBAPP}\n⚡ <b>Delivery:</b> 24/7 Instant Auto-Delivery\n🔒 <b>Security:</b> AES-256 Vault Encryption`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

bot.command('admin', async (ctx) => {
  const { storeName } = await getStoreBranding();
  await ctx.reply(
    `ℹ️ <b>Store Operations & Management</b>\n\n` +
    `This bot is dedicated to customer purchases and digital account deliveries.\n` +
    `For store administration, order fulfillment, and metrics, please launch the dedicated <b>${storeName} Admin Operations Bot</b>.`,
    { parse_mode: 'HTML' }
  );
});

bot.command('referrals', async (ctx) => {
  const { storeName } = await getStoreBranding();
  const user = await getOrRegisterUser(ctx.from!);
  const botUsername = ctx.me.username || 'TZStoreBot';
  const refLink = `https://t.me/${botUsername}?start=ref_${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(`Get instant developer accounts and AI tools on ${storeName}!`)}`;

  const kb = new InlineKeyboard().url('📤 Share Link', shareUrl).row().text('🔙 Back', 'menu:home');

  await ctx.reply(
    `🎁 <b>Referral Program</b>\n\nInvite friends and earn 5% commission on every order they place!\n\n🔗 <b>Your Referral Link:</b>\n<code>${refLink}</code>\n\n💰 <b>Total Earnings:</b> $${user.referral.toFixed(2)}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

// -------------------------------------------------------------
// Telegram Stars Native Payment Handlers (XTR)
// -------------------------------------------------------------
bot.on('pre_checkout_query', async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    console.error('Error answering pre_checkout_query:', err);
  }
});

bot.on(':successful_payment', async (ctx) => {
  try {
    const pay = ctx.message?.successful_payment;
    if (!pay) return;
    const intentId = String(pay.invoice_payload ?? '');
    console.log(`[Telegram Stars] Successful payment for intent: ${intentId}, charge ID: ${pay.telegram_payment_charge_id}`);

    const it = store.getIntent(intentId);
    if (it && (it.status === 'PENDING' || it.status === 'NEEDS_REVIEW')) {
      store.setIntent(it.id, { status: 'CONFIRMED', txHash: pay.telegram_payment_charge_id });
      const { fulfillOrder } = await import('../lib/fulfill');
      await fulfillOrder(it.orderId);
      await ctx.reply(`⭐️ <b>Payment Received!</b>\n\nYour order <code>${it.orderId}</code> has been confirmed and delivered.`, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Error handling successful_payment:', err);
  }
});

bot.catch((e) => console.error('Bot error:', e));

bot.start({
  onStart: async (info) => {
    const { storeName } = await getStoreBranding();
    console.log(`${storeName} User Bot @${info.username} is running and connected!`);
    await bot.api.setMyCommands([
      { command: 'start', description: 'Launch Store & Profile' },
      { command: 'products', description: 'Browse Categories & Products' },
      { command: 'deposit', description: 'Deposit Funds' },
      { command: 'orders', description: 'View My Orders & Deliveries' },
      { command: 'referrals', description: 'Referral Link & Earnings' },
      { command: 'support', description: 'Customer Support' },
      { command: 'about', description: `About ${storeName}` },
    ]).catch(() => {});
  },
});
