export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { sharedProductsBySlug } from '@/lib/admin-api';
const norm = (s: string) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const local = store.listProducts(params.slug) || [];
  const shared = await sharedProductsBySlug(params.slug) || [];
  
  const merged: any[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  // Prioritize local products (managed by Admin Panel with vault credentials)
  for (const p of local) {
    const key = norm(p.title);
    if (!seenIds.has(p.id) && !seenTitles.has(key)) {
      merged.push(p);
      seenIds.add(p.id);
      seenTitles.add(key);
    }
  }

  // Add shared backend products if not already included
  for (const p of shared) {
    const key = norm(p.title);
    if (!seenIds.has(p.id) && !seenTitles.has(key)) {
      merged.push(p);
      seenIds.add(p.id);
      seenTitles.add(key);
    }
  }

  merged.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  
  return NextResponse.json(
    { products: merged, source: 'merged' },
    { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } },
  );
}
