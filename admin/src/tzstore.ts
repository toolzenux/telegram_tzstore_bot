// TZ Store live storefront data (Next.js :3000) via same-origin vite proxy /tz-api.
// No auth needed — Next.js admin routes are local-only.
export const STORE_ORIGIN =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_STORE_URL ?? 'http://localhost:3000';
export const tzLogoUrl = (logo?: string) => {
  if (!logo) return '';
  if (/^(https?:|data:|blob:)/.test(logo)) return logo;
  return `${STORE_ORIGIN}${logo.startsWith('/') ? '' : '/'}${logo}`;
};
export type TzCategory = { slug: string; name: string; emoji?: string; sort?: number; logo?: string };
export type TzProduct = {
  id: string; categorySlug: string; title: string; desc: string; contents: string;
  priceUsdt: number; stock: number; status: 'ACTIVE' | 'OOS'; logo?: string;
  tiers?: Array<{ minQty: number; unitPrice: number }>;
};

async function tzFetch(path: string, opts: RequestInit = {}) {
  const token = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_TZ_ADMIN_TOKEN ?? '';
  const access = typeof localStorage !== 'undefined' ? (localStorage.getItem('tz_access') ?? '') : '';
  const r = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
      ...(access ? { authorization: `Bearer ${access}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => null);
    const msg = typeof err?.error === 'string' ? err.error : (err?.error?.message || `tz-store ${r.status}`);
    throw new Error(msg);
  }
  return r.json();
}

export const tzGetProducts = () => tzFetch('/admin/products') as Promise<{ products: TzProduct[] }>;
export const tzGetCategories = () => tzFetch('/categories') as Promise<{ categories: TzCategory[]; source?: string }>;
export const tzSetPrice = (productId: string, priceUsdt: number) =>
  tzFetch('/admin/products', { method: 'PATCH', body: JSON.stringify({ productId, priceUsdt }) });
export const tzUpdateProduct = (productId: string, patch: { title?: string; categorySlug?: string; priceUsdt?: number; desc?: string; contents?: string; logo?: string; tiers?: Array<{ minQty: number; unitPrice: number }> }) =>
  tzFetch('/admin/products', { method: 'PATCH', body: JSON.stringify({ productId, ...patch }) }) as Promise<{ ok: boolean }>;
export const tzAddStock = (productId: string, qty: number) =>
  tzFetch('/admin/products', { method: 'PATCH', body: JSON.stringify({ productId, addStock: qty }) });
export const tzImportCodes = (productId: string, codes: string) =>
  tzFetch('/admin/codes/import', { method: 'POST', body: JSON.stringify({ productId, codes }) }) as Promise<{ ok: boolean; imported: number }>;
export const tzCreateProduct = (body: { title: string; categorySlug: string; priceUsdt: number; desc?: string; contents?: string; stock?: number; logo?: string; tiers?: Array<{ minQty: number; unitPrice: number }> }) =>
  tzFetch('/admin/products', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ ok: boolean; product: TzProduct }>;
export const tzCreateCategory = (name: string) =>
  tzFetch('/admin/categories', { method: 'POST', body: JSON.stringify({ name }) }) as Promise<{ ok: boolean; category: TzCategory }>;
export const tzReorderCategories = (orderedSlugs: string[]) =>
  tzFetch('/admin/categories', { method: 'PATCH', body: JSON.stringify({ orderedSlugs }) }) as Promise<{ ok: boolean }>;
export const tzDeleteCategory = (slug: string) =>
  tzFetch('/admin/categories', { method: 'DELETE', body: JSON.stringify({ slug }) }) as Promise<{ ok: boolean }>;
export const tzUploadPhoto = (filename: string, dataUrl: string) =>
  tzFetch('/admin/uploads', { method: 'POST', body: JSON.stringify({ filename, dataUrl }) }) as Promise<{ ok: boolean; url: string }>;
export type VaultRow = { id: string; login: string; password: string; status: 'AVAILABLE' | 'SOLD'; orderId: string | null; soldAt: string | null };
export const tzVaultList = (productId: string) =>
  tzFetch(`/admin/vault?productId=${encodeURIComponent(productId)}`) as Promise<{ rows: VaultRow[]; available: number }>;
export const tzVaultAdd = (productId: string, login: string, password: string) =>
  tzFetch('/admin/vault', { method: 'POST', body: JSON.stringify({ productId, login, password }) }) as Promise<{ ok: boolean; imported: number }>;
export const tzVaultImport = (productId: string, codes: string) =>
  tzFetch('/admin/vault', { method: 'POST', body: JSON.stringify({ productId, codes }) }) as Promise<{ ok: boolean; imported: number; skipped: number }>;
export const tzVaultDelete = (id: string) =>
  tzFetch('/admin/vault', { method: 'DELETE', body: JSON.stringify({ id, force: true }) }) as Promise<{ ok: boolean }>;
export const tzVaultUpdate = (id: string, patch: { login?: string; password?: string; status?: 'AVAILABLE' | 'SOLD' }) =>
  tzFetch('/admin/vault', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }) as Promise<{ ok: boolean; item: any }>;
export const tzDeleteProduct = (id: string) =>
  tzFetch('/admin/products', { method: 'DELETE', body: JSON.stringify({ id }) }) as Promise<{ ok: boolean }>;
export const tzFulfillOrder = (orderId: string) =>
  tzFetch('/admin/orders/fulfill', { method: 'POST', body: JSON.stringify({ orderId }) }) as Promise<{ ok: boolean; status: string }>;

// Live order book (Next.js :3000 file store — same orders the storefront creates).
export type TzOrder = {
  id: string; userTg: string; productId: string; qty: number; unitPrice: number; total: number;
  status: 'PENDING' | 'DELIVERED' | 'NEEDS_REVIEW' | 'CANCELLED' | 'REFUNDING';
  createdAt: string; code?: string; deliveries?: Array<{ login: string; password: string }>;
};
export type TzIntent = {
  id: string; orderId: string; provider: string; asset: string; amount: number;
  address?: string; memo?: string; status: string; expiresAt: string; txHash?: string;
};
export const tzGetTzOrders = () =>
  tzFetch('/admin/orders') as Promise<{ orders: TzOrder[]; intents: TzIntent[]; revenue: number }>;
export const tzRefundOrder = (orderId: string) =>
  tzFetch('/admin/refund', { method: 'POST', body: JSON.stringify({ orderId }) }) as Promise<{ ok: boolean; status: string }>;
export const tzClearOrders = () =>
  tzFetch('/admin/orders', { method: 'DELETE' }) as Promise<{ ok: boolean }>;
export const tzDeleteOrder = (orderId: string) =>
  tzFetch('/admin/orders', { method: 'DELETE', body: JSON.stringify({ orderId }) }) as Promise<{ ok: boolean }>;
