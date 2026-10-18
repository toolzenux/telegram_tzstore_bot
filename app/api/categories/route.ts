export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { sharedCategories } from '@/lib/admin-api';
export async function GET() {
  const shared = await sharedCategories() || [];
  const local = store.listCats() || [];
  
  const merged: Array<{ slug: string; backendId?: string; name: string; emoji: string; sort: number; logo: string }> = [...shared];
  const sharedSlugs = new Set(shared.map((c) => c.slug));
  const sharedNames = new Set(shared.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, '')));
  for (const c of local) {
    const nameKey = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!sharedSlugs.has(c.slug) && !sharedNames.has(nameKey)) {
      merged.push(c);
    }
  }
  
  return NextResponse.json(
    { categories: merged, source: 'merged' },
    { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=45' } },
  );
}
