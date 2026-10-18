'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, ShoppingBag } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { backButton, haptic, tzAuthHeader } from '@/lib/tma';

export default function Orders() {
  const router = useRouter();
  useEffect(() => backButton(() => router.back()), [router]);
  const { data, isLoading } = useQuery({
    queryKey: ['mine'],
    queryFn: async () => (await fetch('/api/orders/mine', { headers: { ...tzAuthHeader() } })).json(),
  });

  return (
    <main className="pt-2 space-y-3 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">My Orders</h1>
        <span className="text-xs font-semibold text-slate-500">
          {(data?.orders ?? []).length} {data?.orders?.length === 1 ? 'order' : 'orders'}
        </span>
      </div>

      {isLoading ? (
        <>
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </>
      ) : (
        (data?.orders ?? []).map((o: any) => (
          <Card key={o.id} className="p-4 rounded-2xl border-slate-200/90 shadow-sm bg-white flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 truncate">{o.productId} × {o.qty}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">${Number(o.total).toFixed(2)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  o.status === 'DELIVERED' || o.status === 'CONFIRMED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : o.status === 'NEEDS_REVIEW'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {o.status}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-slate-400 truncate">{o.id}</div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <Link
                onClick={() => haptic('light')}
                className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-center text-xs font-bold text-white hover:bg-black transition"
                href={`/success/${o.id}`}
              >
                View
              </Link>
              <Link
                onClick={() => haptic('light')}
                className="rounded-xl bg-slate-100 border border-slate-200 px-3.5 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                href={`/p/${o.productId}`}
              >
                Reorder
              </Link>
            </div>
          </Card>
        ))
      )}

      {(data?.orders ?? []).length === 0 && !isLoading && (
        <Card className="p-6 text-center rounded-2xl bg-white border-slate-200">
          <Package className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No orders yet</p>
          <p className="mt-1 text-xs text-slate-400">Your purchases and delivery details will appear here.</p>
          <Link
            onClick={() => haptic('light')}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-black transition"
            href="/home"
          >
            <ShoppingBag size={14} />
            <span>Browse Store</span>
          </Link>
        </Card>
      )}

      <button
        type="button"
        onClick={() => { haptic('light'); router.back(); }}
        style={{ minHeight: '44px' }}
        className="w-full flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 shadow-xs transition active:scale-95"
      >
        <ArrowLeft size={14} />
        <span>Back</span>
      </button>
    </main>
  );
}
