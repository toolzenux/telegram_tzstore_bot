// Shared-catalog link: user storefront reads categories/products from
// PostgreSQL (Supabase) via Prisma directly so admin edits appear instantly
// without HTTP roundtrips. Falls back to local demo store if DB is down.
import { db } from './db';

const BASE = process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ADMIN_API_URL ?? '';

async function backendGet<T>(path: string): Promise<T | null> {
  if (!BASE) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch(`${BASE}${path}`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const slugOf = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LOGO_OVERRIDES: Record<string, string> = {
  'tz-vip': '/logos/tz-vip.svg',
  'muse-ai': '/logos/muse.svg',
  'telegram-premium': '/logos/telegram-premium.svg',
  youtube: '/logos/youtube.svg',
};

const CACHE_TTL_MS = 120_000;
let catCache: { data: any[]; exp: number } | null = null;
const slugProductsCache = new Map<string, { data: any[]; exp: number }>();
const productCache = new Map<string, { data: any; exp: number }>();

export function invalidateSharedCache() {
  catCache = null;
  slugProductsCache.clear();
  productCache.clear();
}

export async function preloadAllProducts(): Promise<void> {
  const prisma = db();
  if (!prisma) return;
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        stock: { where: { isSold: false } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const bySlug = new Map<string, any[]>();
    const exp = Date.now() + CACHE_TTL_MS;

    for (const p of products) {
      const slug = slugOf(p.category.name);
      const stock = p.stock.length;
      const mapped = {
        id: p.id,
        categorySlug: slug,
        title: p.name,
        desc: p.description,
        contents: p.description,
        priceUsdt: Number(p.priceUsdt),
        tiers: [] as Array<{ minQty: number; unitPrice: number }>,
        stock,
        status: (stock > 0 ? 'ACTIVE' : 'OOS') as 'ACTIVE' | 'OOS',
        logo: LOGO_OVERRIDES[slug] ?? `/logos/${slug}.svg`,
        sortOrder: p.sortOrder,
      };

      productCache.set(p.id, { data: mapped, exp });
      const arr = bySlug.get(slug) ?? [];
      arr.push(mapped);
      bySlug.set(slug, arr);
    }

    for (const [slug, arr] of bySlug.entries()) {
      slugProductsCache.set(slug, { data: arr, exp });
    }
  } catch (e) {
    console.warn('preloadAllProducts error:', e);
  }
}

export async function warmupSharedCache() {
  try {
    await Promise.allSettled([
      sharedCategories(),
      preloadAllProducts(),
    ]);
  } catch {}
}

if (!process.env.VITEST) {
  setTimeout(() => {
    warmupSharedCache().catch(() => {});
  }, 50);

  // Keep shared cache continuously warm every 45s so users get 0ms latency
  setInterval(() => {
    warmupSharedCache().catch(() => {});
  }, 45_000);
}

export async function sharedCategories() {
  if (catCache && Date.now() < catCache.exp) {
    return catCache.data;
  }
  const prisma = db();
  if (prisma) {
    try {
      const cats = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (cats.length > 0) {
        const mapped = cats.map((c, i) => ({
          slug: slugOf(c.name),
          backendId: c.id,
          name: c.name,
          emoji: c.emoji,
          sort: c.sortOrder ?? i,
          logo: LOGO_OVERRIDES[slugOf(c.name)] ?? `/logos/${slugOf(c.name)}.svg`,
        }));
        catCache = { data: mapped, exp: Date.now() + CACHE_TTL_MS };
        return mapped;
      }
    } catch (e) {
      console.warn('Prisma sharedCategories error, falling back:', e);
    }
  }

  // Fallback to HTTP if external backend URL is configured
  if (BASE) {
    const j = await backendGet<{ categories: Array<{ id: string; name: string; emoji: string; sortOrder: number }> }>('/api/public/categories');
    if (j) {
      const mapped = j.categories.map((c, i) => ({
        slug: slugOf(c.name),
        backendId: c.id,
        name: c.name,
        emoji: c.emoji,
        sort: c.sortOrder ?? i,
        logo: LOGO_OVERRIDES[slugOf(c.name)] ?? `/logos/${slugOf(c.name)}.svg`,
      }));
      catCache = { data: mapped, exp: Date.now() + CACHE_TTL_MS };
      return mapped;
    }
  }

  return null;
}

export async function sharedProductsBySlug(slug: string) {
  const cached = slugProductsCache.get(slug);
  if (cached && Date.now() < cached.exp) {
    return cached.data;
  }
  void preloadAllProducts();
  return cached?.data ?? [];
}

export async function sharedProduct(id: string) {
  const cached = productCache.get(id);
  if (cached && Date.now() < cached.exp) {
    return cached.data;
  }
  void preloadAllProducts();
  return cached?.data ?? null;
}

export async function syncOrderToBackend(order: { orderNo: string; userTg: string; productId: string; qty: number; amountUsdt: number }) {
  if (process.env.VITEST) return false;
  const prisma = db();
  if (prisma) {
    try {
      let tgId: bigint;
      try {
        tgId = BigInt(order.userTg);
      } catch {
        tgId = BigInt(999999999);
      }
      await prisma.user.upsert({
        where: { telegramId: tgId },
        create: {
          telegramId: tgId,
          referralCode: `ref_${tgId.toString().slice(-6)}`,
          status: 'ACTIVE',
        },
        update: {},
      });
      let prod = await prisma.product.findUnique({ where: { id: order.productId } });
      if (!prod) {
        // Fallback: associate with an existing category if product record wasn't seeded yet
        const firstCat = await prisma.category.findFirst();
        if (firstCat) {
          prod = await prisma.product.create({
            data: {
              id: order.productId,
              categoryId: firstCat.id,
              name: order.productId,
              description: order.productId,
              priceUsdt: order.amountUsdt / (order.qty || 1),
              isActive: true,
            },
          });
        }
      }
      if (prod) {
        await prisma.order.upsert({
          where: { orderNo: order.orderNo },
          create: {
            orderNo: order.orderNo,
            userId: tgId,
            productId: prod.id,
            qty: order.qty,
            amountUsdt: order.amountUsdt,
            paymentMethod: 'BINANCE_PAY',
            paymentStatus: 'PENDING',
            deliveryStatus: 'PENDING',
          },
          update: {
            amountUsdt: order.amountUsdt,
            qty: order.qty,
          },
        });
        return true;
      }
    } catch (e) {
      console.warn('Prisma syncOrderToBackend error:', e);
    }
  }
  return false;
}

export async function sharedOrder(orderNo: string) {
  const prisma = db();
  if (prisma) {
    try {
      const dbOrder = await prisma.order.findUnique({
        where: { orderNo },
        include: {
          product: {
            include: { category: true },
          },
          stockItems: true,
        },
      });
      if (dbOrder) {
        let deliveries: Array<{ login: string; password: string }> | undefined = undefined;
        if (dbOrder.deliveredData) {
          try {
            deliveries = JSON.parse(dbOrder.deliveredData);
          } catch {
            deliveries = undefined;
          }
        } else if (dbOrder.stockItems && dbOrder.stockItems.length > 0) {
          deliveries = dbOrder.stockItems.map((s) => {
            const parts = s.data.split(':');
            return { login: parts[0] || 'account', password: parts[1] || s.data };
          });
        }
        return {
          id: dbOrder.orderNo,
          userTg: dbOrder.userId.toString(),
          productId: dbOrder.productId,
          qty: dbOrder.qty,
          unitPrice: Number(dbOrder.amountUsdt) / (dbOrder.qty || 1),
          total: Number(dbOrder.amountUsdt),
          status: dbOrder.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : (dbOrder.paymentStatus === 'PAID' ? 'CONFIRMED' : dbOrder.paymentStatus),
          createdAt: dbOrder.createdAt.toISOString(),
          code: dbOrder.deliveredData ?? undefined,
          deliveries,
          product: dbOrder.product ? {
            id: dbOrder.product.id,
            title: dbOrder.product.name,
            desc: dbOrder.product.description,
            priceUsdt: Number(dbOrder.product.priceUsdt),
            categorySlug: dbOrder.product.category ? slugOf(dbOrder.product.category.name) : 'general',
            logo: dbOrder.product.category ? (LOGO_OVERRIDES[slugOf(dbOrder.product.category.name)] ?? `/logos/${slugOf(dbOrder.product.category.name)}.svg`) : '/logos/general.svg',
          } : null,
        };
      }
    } catch (e) {
      console.warn('Prisma sharedOrder error:', e);
    }
  }
  return null;
}

export async function sharedOrdersByUser(userTg: string) {
  const prisma = db();
  if (prisma) {
    try {
      let tgId: bigint;
      try { tgId = BigInt(userTg); } catch { tgId = BigInt(999999999); }
      const dbOrders = await prisma.order.findMany({
        where: { userId: tgId },
        orderBy: { createdAt: 'desc' },
        include: { product: true },
      });
      return dbOrders.map((o) => ({
        id: o.orderNo,
        userTg: o.userId.toString(),
        productId: o.productId,
        qty: o.qty,
        unitPrice: Number(o.amountUsdt) / (o.qty || 1),
        total: Number(o.amountUsdt),
        status: o.paymentStatus,
        createdAt: o.createdAt.toISOString(),
      }));
    } catch (e) {
      console.warn('Prisma sharedOrdersByUser error:', e);
    }
  }
  return null;
}

