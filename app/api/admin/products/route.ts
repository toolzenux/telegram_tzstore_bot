export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { requireAdminToken } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import { invalidateSharedCache } from '@/lib/admin-api';
import { vaultEncrypt, parseCredentialLine } from '@/lib/vault-crypto';
const tierSchema = z.object({ minQty: z.number().int().min(1), unitPrice: z.number().positive() });

export async function GET(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  return NextResponse.json({ products: store.allProducts() });
}
export async function PATCH(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({
    productId: z.string().optional(),
    orderedIds: z.array(z.string()).min(1).max(500).optional(),
    sortOrder: z.number().int().min(0).max(99999).optional(),
    priceUsdt: z.number().positive().max(100000).optional(),
    addStock: z.number().int().min(0).max(100000).optional(),
    logo: z.string().max(300).optional(),
    title: z.string().min(2).max(120).optional(),
    categorySlug: z.string().min(2).max(60).optional(),
    desc: z.string().max(2000).optional(),
    contents: z.string().max(2000).optional(),
    tiers: z.array(tierSchema).optional(),
  }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  try {
    const prisma = db();
    if (p.data.orderedIds && p.data.orderedIds.length > 0) {
      store.reorderProducts(p.data.orderedIds);
      if (prisma) {
        await Promise.all(
          p.data.orderedIds.map((id, idx) =>
            prisma.product.updateMany({ where: { id }, data: { sortOrder: idx + 1 } }).catch(() => null)
          )
        );
      }
      invalidateSharedCache();
      return NextResponse.json({ ok: true });
    }

    if (!p.data.productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    if (p.data.priceUsdt !== undefined) store.setPrice(p.data.productId, p.data.priceUsdt);
    if (p.data.addStock) store.addStock(p.data.productId, p.data.addStock);
    if (p.data.logo) store.setLogo(p.data.productId, p.data.logo);
    if (p.data.tiers !== undefined) store.setTiers(p.data.productId, p.data.tiers);
    if (
      p.data.title !== undefined ||
      p.data.categorySlug !== undefined ||
      p.data.desc !== undefined ||
      p.data.contents !== undefined ||
      p.data.sortOrder !== undefined
    ) {
      store.updateProduct(p.data.productId, {
        title: p.data.title,
        categorySlug: p.data.categorySlug,
        desc: p.data.desc,
        contents: p.data.contents,
        logo: p.data.logo,
        tiers: p.data.tiers,
        sortOrder: p.data.sortOrder,
      });
      if (prisma && p.data.sortOrder !== undefined) {
        await prisma.product.updateMany({
          where: { id: p.data.productId },
          data: { sortOrder: p.data.sortOrder },
        }).catch(() => null);
      }
    }
    invalidateSharedCache();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
export async function POST(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({
    title: z.string().min(2).max(120),
    categorySlug: z.string().min(2).max(60),
    priceUsdt: z.number().positive().max(100000),
    desc: z.string().max(2000).optional().default(''),
    contents: z.string().max(2000).optional().default(''),
    stock: z.number().int().min(0).max(100000).optional().default(0),
    logo: z.string().max(300).optional().default(''),
    tiers: z.array(tierSchema).optional().default([]),
    sortOrder: z.number().int().min(0).max(99999).optional(),
    deliveryMode: z.enum(['AUTO', 'MANUAL']).optional().default('AUTO'),
    initialAccounts: z.string().max(50000).optional().default(''),
  }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });

  const created = store.addProduct({
    title: p.data.title,
    categorySlug: p.data.categorySlug,
    priceUsdt: p.data.priceUsdt,
    desc: p.data.desc,
    contents: p.data.contents || p.data.desc,
    stock: p.data.stock,
    logo: p.data.logo,
    tiers: p.data.tiers,
    sortOrder: p.data.sortOrder,
  });

  let importedCount = 0;
  if (p.data.initialAccounts && p.data.initialAccounts.trim()) {
    const lines = p.data.initialAccounts.split('\n').map((s) => s.trim()).filter(Boolean);
    const parsed = lines.map(parseCredentialLine);
    const valid = parsed.filter((r): r is { login: string; password: string } => !!r);
    if (valid.length > 0) {
      const rows = valid.map((r) => ({
        login: r.login,
        passwordEnc: vaultEncrypt(r.password),
      }));
      store.vaultAdd(created.id, rows);
      importedCount = rows.length;
      const avail = store.vaultAvailable(created.id);
      store.updateProduct(created.id, { stock: avail });
      created.stock = avail;
      created.status = 'ACTIVE';
    }
  }

  // Sync to PostgreSQL Prisma if connected
  const prisma = db();
  if (prisma) {
    try {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: p.data.categorySlug, mode: 'insensitive' } },
      }) || await prisma.category.findFirst();
      if (cat) {
        await prisma.product.create({
          data: {
            id: created.id,
            categoryId: cat.id,
            name: p.data.title,
            description: p.data.desc || p.data.title,
            deliveryTemplate: p.data.contents || '',
            priceUsdt: p.data.priceUsdt,
            sortOrder: p.data.sortOrder ?? 0,
            deliveryMode: p.data.deliveryMode,
          },
        }).catch(() => null);

        if (importedCount > 0 && p.data.initialAccounts) {
          const lines = p.data.initialAccounts.split('\n').map((s) => s.trim()).filter(Boolean);
          const parsed = lines.map(parseCredentialLine);
          const valid = parsed.filter((r): r is { login: string; password: string } => !!r);
          await prisma.stockItem.createMany({
            data: valid.map((r) => ({
              productId: created.id,
              data: `${r.login}:${r.password}`,
              isSold: false,
            })),
          }).catch(() => null);
        }
      }
    } catch (err) {
      console.warn('Prisma product creation sync warning:', err);
    }
  }

  invalidateSharedCache();
  return NextResponse.json({ ok: true, product: created, importedAccounts: importedCount }, { status: 201 });
}

export async function DELETE(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({ id: z.string().min(1) }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  try {
    store.deleteProduct(p.data.id);
    const prisma = db();
    if (prisma) {
      await prisma.product.deleteMany({ where: { id: p.data.id } });
    }
    invalidateSharedCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: 400 });
  }
}
