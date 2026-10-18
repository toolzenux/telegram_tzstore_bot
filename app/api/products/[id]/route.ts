export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { sharedProduct } from '@/lib/admin-api';
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const shared = await sharedProduct(params.id);
  if (shared) {
    return NextResponse.json(
      { product: shared, source: 'admin' },
      { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } },
    );
  }
  const p = store.getProduct(params.id);
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(
    { product: p, source: 'local' },
    { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } },
  );
}
