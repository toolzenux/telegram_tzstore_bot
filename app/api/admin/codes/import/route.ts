import { NextResponse } from 'next/server';
import { z } from 'zod';
import { store } from '@/lib/store';
import { vaultEncrypt, parseCredentialLine } from '@/lib/vault-crypto';
import { requireAdminToken } from '@/lib/admin-auth';

// Bulk account import: supports `login | password`, `login:password`, `login----password`, CSV, TSV.
// Each row is AES-GCM encrypted into the delivery vault and counted as stock.
const schema = z.object({ productId: z.string(), codes: z.string().min(1) });


export async function POST(req: Request) {
  const denied = requireAdminToken(req);
  if (denied) return denied;
  const j = await req.json().catch(() => ({}));
  const p = schema.safeParse(j);
  if (!p.success) return NextResponse.json({ error: 'bad' }, { status: 400 });
  const lines = p.data.codes.split('\n').map((s) => s.trim()).filter(Boolean);
  const parsed = lines.map(parseCredentialLine);
  const bad = lines.length - parsed.filter(Boolean).length;
  if (!parsed.filter(Boolean).length) {
    return NextResponse.json({ error: 'no valid rows — use one `login | password` per line' }, { status: 400 });
  }
  const rows = parsed.filter((r): r is { login: string; password: string } => !!r)
    .map((r) => ({ login: r.login, passwordEnc: vaultEncrypt(r.password) }));
  const imported = store.vaultAdd(p.data.productId, rows);
  return NextResponse.json({ ok: true, imported, skipped: bad });
}
