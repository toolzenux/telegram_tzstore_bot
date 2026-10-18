// File-backed demo store so the app runs without Postgres.
// Postgres/Prisma path replaces this in production (same shapes).
import fs from 'fs';
import path from 'path';
import { PRODUCTS, CATEGORIES } from './seed-data';
import type { SeedProduct, BulkTier } from './seed-data';
import { vaultDecrypt, vaultEncrypt } from './vault-crypto';
const LOGO = Object.fromEntries(CATEGORIES.map((c: any) => [c.slug, (c as any).logo]));
const withLogo = <T extends { categorySlug: string }>(p: T) => ({ ...p, logo: (LOGO as Record<string, string>)[p.categorySlug] ?? `/logos/${p.categorySlug}.svg` });
const FILE = () => {
  if (process.env.TZ_DATA_STORE) {
    return path.isAbsolute(process.env.TZ_DATA_STORE)
      ? process.env.TZ_DATA_STORE
      : path.join(process.cwd(), process.env.TZ_DATA_STORE);
  }
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return '/tmp/.data-store.json';
  }
  return path.join(process.cwd(), '.data-store.json');
};
type Order = { id: string; userTg: string; productId: string; qty: number; unitPrice: number; total: number; status: string; createdAt: string; code?: string; deliveries?: Array<{ login: string; password: string }> };
type Intent = { id: string; orderId: string; provider: string; asset: string; amount: number; address?: string; memo?: string; status: string; expiresAt: string; txHash?: string; invoiceLink?: string };
export type VaultRow = { id: string; productId: string; login: string; passwordEnc: string; status: 'AVAILABLE' | 'SOLD'; orderId?: string; soldAt?: string; createdAt: string };
type State = { orders: Order[]; intents: Intent[]; notifs: { userTg: string; productId: string }[]; stockOv: Record<string, number>; priceOv: Record<string, number>; tiersOv: Record<string, BulkTier[]>; logoOv: Record<string, string>; titleOv: Record<string, string>; descOv: Record<string, string>; contentsOv: Record<string, string>; catOv: Record<string, string>; deletedProducts?: string[]; custom: SeedProduct[]; customCats: Array<{ slug: string; name: string; emoji: string; sort: number; logo: string }>; catOrder: string[]; vault: VaultRow[]; restocks: { id: string; productId: string; qty: number; message: string; createdAt: string }[]; settings?: Record<string, unknown> };
let memState: State | null = null;
let currentFile: string = '';
let lastMtime: number = 0;
function load(): State {
  const f = FILE();
  try {
    if (fs.existsSync(f)) {
      const mtime = fs.statSync(f).mtimeMs;
      if (memState && currentFile === f && mtime === lastMtime) return memState;
      currentFile = f;
      lastMtime = mtime;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const state: State = { orders: [], intents: [], notifs: [], stockOv: {}, priceOv: {}, tiersOv: {}, logoOv: {}, titleOv: {}, descOv: {}, contentsOv: {}, catOv: {}, deletedProducts: [], custom: [], customCats: [], catOrder: [], vault: [], restocks: [], settings: {}, ...j };
      memState = state;
      return state;
    }
    const bundle = path.join(process.cwd(), '.data-store.json');
    if (fs.existsSync(bundle)) {
      try { fs.copyFileSync(bundle, f); } catch {}
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      const state: State = { orders: [], intents: [], notifs: [], stockOv: {}, priceOv: {}, tiersOv: {}, logoOv: {}, titleOv: {}, descOv: {}, contentsOv: {}, catOv: {}, deletedProducts: [], custom: [], customCats: [], catOrder: [], vault: [], restocks: [], settings: {}, ...j };
      memState = state;
      currentFile = f;
      try { lastMtime = fs.statSync(f).mtimeMs; } catch {}
      return state;
    }

  } catch {}
  if (memState && currentFile === f) return memState;
  const fallback: State = { orders: [], intents: [], notifs: [], stockOv: {}, priceOv: {}, tiersOv: {}, logoOv: {}, titleOv: {}, descOv: {}, contentsOv: {}, catOv: {}, deletedProducts: [], custom: [], customCats: [], catOrder: [], vault: [], restocks: [{ id: 'r1', productId: 'p-gemini-18m', qty: 30, message: 'Restocked! Gemini 18 Months', createdAt: new Date().toISOString() }], settings: {} };
  memState = fallback;
  return fallback;
}
function save(s: State) {
  const f = FILE();
  memState = s;
  currentFile = f;
  try {
    fs.writeFileSync(f, JSON.stringify(s));
    try { lastMtime = fs.statSync(f).mtimeMs; } catch {}
  } catch {
    try {
      fs.writeFileSync('/tmp/.data-store.json', JSON.stringify(s));
    } catch {}
  }
}
function effStock(s: State, p: { id: string; stock: number }) {
  if (s.vault.some((v) => v.productId === p.id)) {
    return s.vault.filter((v) => v.productId === p.id && v.status === 'AVAILABLE').length;
  }
  return s.stockOv[p.id] ?? p.stock;
}
function effPrice(s: State, p: { id: string; priceUsdt: number }) { return s.priceOv[p.id] ?? p.priceUsdt; }
function effTiers(s: State, p: SeedProduct): BulkTier[] { return s.tiersOv[p.id] ?? p.tiers ?? []; }
function effLogo<T extends { id: string; categorySlug: string }>(s: State, p: T) {
  return s.logoOv[p.id] ?? (LOGO as Record<string, string>)[effCat(s, p)] ?? `/logos/${effCat(s, p)}.svg`;
}
function effTitle(s: State, p: { id: string; title: string }) { return s.titleOv[p.id] ?? p.title; }
function effDesc(s: State, p: { id: string; desc: string }) { return s.descOv[p.id] ?? p.desc; }
function effContents(s: State, p: { id: string; contents: string }) { return s.contentsOv[p.id] ?? p.contents; }
function effCat<T extends { id: string; categorySlug: string }>(s: State, p: T) { return s.catOv[p.id] ?? p.categorySlug; }
function allSeedAndCustom(s: State): SeedProduct[] { return [...PRODUCTS, ...s.custom].filter((p) => !(s.deletedProducts ?? []).includes(p.id)); }
export const store = {
  listCats: () => {
    const s = load();
    const all = [...CATEGORIES, ...s.customCats] as Array<{ slug: string; name: string; emoji: string; sort: number; logo: string }>;
    if (!s.catOrder.length) return all;
    const pos = new Map(s.catOrder.map((slug, i) => [slug, i]));
    return [...all].sort((a, b) => (pos.get(a.slug) ?? 9999) - (pos.get(b.slug) ?? 9999));
  },
  addCategory: (name: string) => {
    const s = load();
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    if (!slug) throw new Error('bad name');
    const exists = [...CATEGORIES, ...s.customCats].find((c) => (c as { slug: string }).slug === slug);
    if (exists) return exists as { slug: string; name: string };
    const cat = { slug, name: name.trim().slice(0, 80), emoji: '', sort: 99, logo: `/logos/${slug}.svg` };
    s.customCats.push(cat);
    save(s);
    return cat;
  },
  reorderCats: (orderedSlugs: string[]) => {
    const s = load();
    const known = new Set([...CATEGORIES, ...s.customCats].map((c) => (c as { slug: string }).slug));
    s.catOrder = orderedSlugs.filter((slug) => known.has(slug));
    save(s);
  },
  deleteCategory: (slug: string) => {
    const s = load();
    if ((CATEGORIES as Array<{ slug: string }>).some((c) => c.slug === slug)) throw new Error('built-in categories cannot be deleted');
    if (allSeedAndCustom(s).some((p) => p.categorySlug === slug)) throw new Error('move its products to another category first');
    s.customCats = s.customCats.filter((c) => c.slug !== slug);
    s.catOrder = s.catOrder.filter((x) => x !== slug);
    save(s);
  },
  listProducts: (slug: string) => allSeedAndCustom(load()).filter((p) => { const s = load(); return effCat(s, p) === slug; }).map((p) => { const s = load(); return { ...p, categorySlug: effCat(s, p), title: effTitle(s, p), desc: effDesc(s, p), contents: effContents(s, p), logo: effLogo(s, p), priceUsdt: effPrice(s, p), tiers: effTiers(s, p), stock: effStock(s, p) }; }),
  getProduct: (id: string) => {
    const s = load();
    const p = allSeedAndCustom(s).find((x) => x.id === id);
    if (!p) return undefined;
    const st = effStock(s, p);
    return { ...p, categorySlug: effCat(s, p), title: effTitle(s, p), desc: effDesc(s, p), contents: effContents(s, p), logo: effLogo(s, p), priceUsdt: effPrice(s, p), tiers: effTiers(s, p), stock: st, status: (st <= 0 ? 'OOS' : p.status) as 'ACTIVE' | 'OOS' };
  },
  createOrder: (o: Order) => { const s = load(); s.orders.push(o); save(s); return o; },
  getOrder: (id: string) => load().orders.find((o) => o.id === id),
  myOrders: (tg: string) => load().orders.filter((o) => o.userTg === tg).reverse(),
  setOrderStatus: (id: string, status: string, code?: string) => { const s = load(); const o = s.orders.find((x) => x.id === id); if (o) { o.status = status; if (code) o.code = code; } save(s); },
  createIntent: (i: Intent) => { const s = load(); s.intents.push(i); save(s); return i; },
  getIntent: (id: string) => load().intents.find((i) => i.id === id),
  setIntent: (id: string, patch: Partial<Intent>) => { const s = load(); const it = s.intents.find((x) => x.id === id); if (it) Object.assign(it, patch); save(s); },
  addNotif: (userTg: string, productId: string) => { const s = load(); if (!s.notifs.find((n) => n.userTg === userTg && n.productId === productId)) s.notifs.push({ userTg, productId }); save(s); },
  restocks: () => load().restocks,
  addRestock: (r: State['restocks'][number]) => { const s = load(); s.restocks.unshift(r); save(s); },
  allProducts: () => { const s = load(); return allSeedAndCustom(s).map((p) => ({ ...p, categorySlug: effCat(s, p), title: effTitle(s, p), desc: effDesc(s, p), contents: effContents(s, p), logo: effLogo(s, p), priceUsdt: effPrice(s, p), tiers: effTiers(s, p), stock: effStock(s, p) })); },
  setPrice: (id: string, price: number) => {
    const s = load();
    const seed = PRODUCTS.find((x) => x.id === id);
    if (seed) seed.priceUsdt = price;
    const cu = s.custom.find((x) => x.id === id);
    if (cu) cu.priceUsdt = price;
    s.priceOv[id] = price;
    save(s);
  },
  setTiers: (id: string, tiers: BulkTier[]) => {
    const s = load();
    const seed = PRODUCTS.find((x) => x.id === id);
    if (seed) seed.tiers = tiers;
    const cu = s.custom.find((x) => x.id === id);
    if (cu) cu.tiers = tiers;
    s.tiersOv[id] = tiers;
    save(s);
  },
  addStock: (id: string, n: number) => { const s = load(); const base = allSeedAndCustom(s).find((x) => x.id === id)?.stock ?? 0; s.stockOv[id] = (s.stockOv[id] ?? base) + n; save(s); },
  addProduct: (p: { title: string; categorySlug: string; priceUsdt: number; desc?: string; contents?: string; stock?: number; logo?: string; tiers?: BulkTier[] }) => {
    const s = load();
    const id = `p-custom-${Date.now().toString(36)}`;
    const item: SeedProduct = {
      id, categorySlug: p.categorySlug, title: p.title,
      desc: p.desc ?? '', contents: p.contents ?? '',
      priceUsdt: p.priceUsdt, tiers: p.tiers ?? [], stock: p.stock ?? 0, status: 'ACTIVE',
    };
    s.custom.push(item);
    if (p.logo) s.logoOv[id] = p.logo;
    if (p.tiers && p.tiers.length) s.tiersOv[id] = p.tiers;
    save(s);
    return { ...item, logo: effLogo(s, item), tiers: effTiers(s, item) };
  },
  setLogo: (id: string, logo: string) => { const s = load(); s.logoOv[id] = logo; save(s); },
  updateProduct: (id: string, patch: { title?: string; categorySlug?: string; desc?: string; contents?: string; logo?: string; tiers?: BulkTier[] }) => {
    const s = load();
    const target = allSeedAndCustom(s).find((x) => x.id === id);
    if (!target) throw new Error('unknown product');
    if (patch.categorySlug) {
      const known = [...CATEGORIES, ...s.customCats].some((c) => (c as { slug: string }).slug === patch.categorySlug);
      if (!known) throw new Error('unknown category');
    }
    const cu = s.custom.find((x) => x.id === id);
    if (patch.title !== undefined) { s.titleOv[id] = patch.title; if (cu) cu.title = patch.title; }
    if (patch.desc !== undefined) { s.descOv[id] = patch.desc; s.contentsOv[id] = patch.contents ?? patch.desc; if (cu) { cu.desc = patch.desc; cu.contents = patch.contents ?? patch.desc; } }
    if (patch.categorySlug !== undefined) { s.catOv[id] = patch.categorySlug; if (cu) cu.categorySlug = patch.categorySlug; }
    if (patch.logo !== undefined) { s.logoOv[id] = patch.logo; }
    if (patch.tiers !== undefined) { s.tiersOv[id] = patch.tiers; if (cu) cu.tiers = patch.tiers; if (target) target.tiers = patch.tiers; }
    save(s);
  },
  // ---- Delivery vault (account ID + password rows, encrypted at rest) ----
  vaultHas: (productId: string) => load().vault.some((v) => v.productId === productId),
  vaultAvailable: (productId: string) => load().vault.filter((v) => v.productId === productId && v.status === 'AVAILABLE').length,
  vaultList: (productId: string) => load().vault
    .filter((v) => v.productId === productId)
    .map((v) => ({ id: v.id, login: v.login, password: vaultDecrypt(v.passwordEnc), status: v.status, orderId: v.orderId ?? null, soldAt: v.soldAt ?? null })),
  vaultAdd: (productId: string, rows: Array<{ login: string; passwordEnc: string }>) => {
    const s = load();
    for (const r of rows) {
      s.vault.push({ id: `v-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, productId, login: r.login, passwordEnc: r.passwordEnc, status: 'AVAILABLE', createdAt: new Date().toISOString() });
    }
    save(s);
    return rows.length;
  },
  // Atomic take-N-or-nothing. Returns decrypted deliveries or null when short.
  vaultTake: (productId: string, qty: number, orderId: string) => {
    const s = load();
    const avail = s.vault.filter((v) => v.productId === productId && v.status === 'AVAILABLE');
    if (avail.length < qty) return null;
    const picked = avail.slice(0, qty);
    const now = new Date().toISOString();
    for (const v of picked) { v.status = 'SOLD'; v.orderId = orderId; v.soldAt = now; }
    save(s);
    return picked.map((v) => ({ login: v.login, password: vaultDecrypt(v.passwordEnc) }));
  },
  vaultReleaseByOrder: (orderId: string) => {
    const s = load();
    let n = 0;
    for (const v of s.vault) {
      if (v.orderId === orderId && v.status === 'SOLD') { v.status = 'AVAILABLE'; delete v.orderId; delete v.soldAt; n += 1; }
    }
    if (n) save(s);
    return n;
  },
  vaultUpdate: (id: string, patch: { login?: string; password?: string; status?: 'AVAILABLE' | 'SOLD' }) => {
    const s = load();
    const v = s.vault.find((x) => x.id === id);
    if (!v) throw new Error('not found');
    if (patch.login !== undefined) v.login = patch.login.trim();
    if (patch.password !== undefined && patch.password.trim()) v.passwordEnc = vaultEncrypt(patch.password);
    if (patch.status !== undefined) v.status = patch.status;
    save(s);
    return { id: v.id, login: v.login, status: v.status };
  },
  vaultDelete: (id: string, force = true) => {
    const s = load();
    const v = s.vault.find((x) => x.id === id);
    if (!v) throw new Error('not found');
    if (!force && v.status !== 'AVAILABLE') throw new Error('already sold — refund the order to release it');
    s.vault = s.vault.filter((x) => x.id !== id);
    save(s);
  },
  deleteProduct: (id: string) => {
    const s = load();
    if (!s.deletedProducts) s.deletedProducts = [];
    if (!s.deletedProducts.includes(id)) s.deletedProducts.push(id);
    s.custom = s.custom.filter((p) => p.id !== id);
    s.vault = s.vault.filter((v) => v.productId !== id);
    save(s);
  },
  setOrderDeliveries: (id: string, deliveries: Array<{ login: string; password: string }>) => {
    const s = load();
    const o = s.orders.find((x) => x.id === id);
    if (o) { o.deliveries = deliveries; }
    save(s);
  },
  allOrders: () => load().orders,
  allIntents: () => load().intents,
  clearOrders: () => {
    const s = load();
    s.orders = [];
    s.intents = [];
    for (const v of s.vault) {
      if (v.status === 'SOLD') {
        v.status = 'AVAILABLE';
        delete v.orderId;
        delete v.soldAt;
      }
    }
    save(s);
  },
  deleteOrder: (id: string) => {
    const s = load();
    s.orders = s.orders.filter((o) => o.id !== id);
    s.intents = s.intents.filter((i) => i.orderId !== id);
    for (const v of s.vault) {
      if (v.orderId === id) {
        v.status = 'AVAILABLE';
        delete v.orderId;
        delete v.soldAt;
      }
    }
    save(s);
  },
  getSetting: <T = unknown>(key: string, fallback?: T): T | undefined => {
    const s = load();
    return (s.settings?.[key] as T) ?? fallback;
  },
  setSetting: (key: string, value: unknown) => {
    const s = load();
    s.settings = s.settings || {};
    s.settings[key] = value;
    save(s);
  },
  getSettings: (): Record<string, unknown> => {
    const s = load();
    return s.settings || {};
  },
};

