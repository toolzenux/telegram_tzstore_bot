export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { vaultEncrypt, parseCredentialLine } from '@/lib/vault-crypto';
import { requireAdminToken } from '@/lib/admin-auth';
import { db } from '@/lib/db';

// Delivery vault admin API (proxied by admin panel as /tz-api/admin/vault).
// GET ?productId= — rows with decrypted passwords (local admin only).
// POST { productId, login, password } — add one row.
// POST { productId, codes } — bulk import, supports `login | pass`, `login:pass`, `login----pass`, CSV.
// DELETE { id } — remove an AVAILABLE row.
export async function GET(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const productId = new URL(req.url).searchParams.get('productId') ?? '';
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });
  return NextResponse.json({ rows: store.vaultList(productId), available: store.vaultAvailable(productId) });
}

export async function POST(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({
    productId: z.string().min(1),
    login: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    codes: z.string().optional(),
  }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });

  if (p.data.codes) {
    const lines = p.data.codes.split('\n').map((s) => s.trim()).filter(Boolean);
    const parsed = lines.map(parseCredentialLine);
    const valid = parsed.filter((r): r is { login: string; password: string } => !!r);
    const skipped = lines.length - valid.length;
    if (!valid.length) {
      return NextResponse.json({
        error: 'No valid account credentials detected. Please use format: login | password or login:password (one per line)',
      }, { status: 400 });
    }
    const rows = valid.map((r) => ({
      login: r.login,
      passwordEnc: vaultEncrypt(r.password),
    }));
    const imported = store.vaultAdd(p.data.productId, rows);

    // Sync to Prisma StockItem if database is connected
    const prisma = db();
    if (prisma) {
      try {
        const prod = await prisma.product.findUnique({ where: { id: p.data.productId } });
        if (prod) {
          await prisma.stockItem.createMany({
            data: valid.map((r) => ({
              productId: p.data.productId,
              data: `${r.login}:${r.password}`,
              isSold: false,
            })),
          });
        }
      } catch (err) {
        console.warn('Prisma stockItem sync warning:', err);
      }
    }

    return NextResponse.json({ ok: true, imported, skipped }, { status: 201 });
  }

  if (!p.data.login || !p.data.password) return NextResponse.json({ error: 'login and password required' }, { status: 400 });
  const imported = store.vaultAdd(p.data.productId, [{ login: p.data.login.trim(), passwordEnc: vaultEncrypt(p.data.password) }]);

  // Sync single to Prisma
  const prisma = db();
  if (prisma) {
    try {
      const prod = await prisma.product.findUnique({ where: { id: p.data.productId } });
      if (prod) {
        await prisma.stockItem.create({
          data: {
            productId: p.data.productId,
            data: `${p.data.login.trim()}:${p.data.password}`,
            isSold: false,
          },
        });
      }
    } catch {}
  }

  return NextResponse.json({ ok: true, imported }, { status: 201 });
}

export async function PATCH(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({
    id: z.string().min(1),
    login: z.string().max(200).optional(),
    password: z.string().max(500).optional(),
    status: z.enum(['AVAILABLE', 'SOLD']).optional(),
  }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  try {
    const item = store.vaultUpdate(p.data.id, {
      login: p.data.login,
      password: p.data.password,
      status: p.data.status,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = z.object({ id: z.string().min(1), force: z.boolean().optional() }).safeParse(j);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  try {
    store.vaultDelete(p.data.id, p.data.force ?? true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: 400 });
  }
}
