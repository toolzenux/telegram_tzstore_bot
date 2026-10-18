export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function GET() {
  const products = store.allProducts() || [];
  return NextResponse.json(
    { products },
    { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=45' } },
  );
}
