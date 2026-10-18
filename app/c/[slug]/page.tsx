'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { Card, PricePill, StockBadge, Skeleton, CatLogo } from '@/components/ui';
import { backButton, haptic } from '@/lib/tma';

export default function Category({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => backButton(() => router.back()), [router]);
  const { data, isLoading } = useQuery({ 
    queryKey: ['cat', params.slug], 
    queryFn: async () => (await fetch(`/api/categories/${params.slug}/products`)).json(),
    staleTime: 60000,
  });

  // Instant Prefetch: Pre-seed each product in React Query cache
  useEffect(() => {
    if (data?.products) {
      for (const p of data.products) {
        qc.setQueryData(['p', p.id], (old: any) => old ?? { product: p, source: 'preloaded' });
        qc.prefetchQuery({
          queryKey: ['p', p.id],
          queryFn: async () => (await fetch(`/api/products/${p.id}`)).json(),
          staleTime: 60000,
        });
      }
    }
  }, [data?.products, qc]);

  const prefetchProduct = (p: any) => {
    qc.setQueryData(['p', p.id], (old: any) => old ?? { product: p, source: 'preloaded' });
  };

  return (
    <main className="pt-2 pb-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold capitalize text-gray-900 tracking-tight">
            {params.slug.replace('-', ' ')}
          </h1>
          <p className="text-[11px] text-gray-500">Instant digital goods • 24/7 delivery</p>
        </div>
        <button 
          type="button"
          onClick={() => { haptic('light'); router.back(); }} 
          className="inline-flex items-center gap-1 text-xs font-bold text-[#2481CC] px-3 py-1.5 rounded-xl bg-[#2481CC]/10 hover:bg-[#2481CC]/20 active:scale-95 transition touch-manipulation"
        >
          <ArrowLeft size={13} /> Back
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (data?.products ?? []).length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center border border-gray-200 shadow-sm space-y-2">
          <div className="text-3xl">📦</div>
          <div className="text-[15px] font-bold text-gray-800">No products in this category</div>
          <p className="text-xs text-gray-500">Check back soon for restocks or browse other categories.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(data?.products ?? []).map((p: any) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              onClick={() => haptic('light')}
              onMouseEnter={() => prefetchProduct(p)}
              onTouchStart={() => prefetchProduct(p)}
              className="block rounded-[18px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] tg-press active:scale-[0.98] transition hover:shadow-md touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                  <CatLogo logo={(p as any).logo} emoji="📦" name={p.title} size={38} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] text-gray-900 truncate">
                    {p.title}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[13px] font-black text-emerald-700">
                      ${Number(p.priceUsdt || 0).toFixed(2)} USDT
                    </span>
                    <StockBadge stock={p.stock} />
                    {p.tiers?.length > 0 && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md">
                        Bulk −save
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[#2481CC] text-xs font-bold bg-[#2481CC]/10 px-2.5 py-1.5 rounded-xl">
                  <span>Buy</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <button 
        type="button"
        onClick={() => { haptic('light'); router.back(); }} 
        className="w-full mt-4 rounded-[16px] bg-white border border-gray-200 py-3 text-[14px] font-bold text-gray-700 shadow-sm tg-press active:scale-[0.98] transition touch-manipulation"
      >
        ← Back
      </button>
    </main>
  );
}
