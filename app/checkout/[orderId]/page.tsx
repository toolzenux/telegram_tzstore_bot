'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Wallet, Loader2, ChevronRight, ShieldCheck, ArrowLeft, Package, ShoppingBag, ClipboardList } from 'lucide-react';
import { Card, Skeleton, Toast, CatLogo } from '@/components/ui';
import { backButton, haptic, tzAuthHeader } from '@/lib/tma';

type Method = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  badge?: string;
};

const METHODS: Method[] = [
  { id: 'BINANCE', label: 'Binance Pay', hint: 'UID transfer • instant', icon: '/logos/pay-binance.svg', badge: '0% Fee' },
  { id: 'BEP20', label: 'USDT · BEP20', hint: 'BNB Smart Chain • instant', icon: '/logos/pay-tether.svg', badge: 'Auto' },
];

const money = (n: number) =>
  `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Checkout({ params }: { params: { orderId: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const preloadedBinanceRef = useRef<any>(null);
  const preloadedPromiseRef = useRef<Promise<any> | null>(null);
  const preloadCacheRef = useRef<Map<string, any>>(new Map());

  useEffect(() => backButton(() => router.back()), [router]);

  useEffect(() => {
    if (params.orderId?.startsWith('p-')) {
      (async () => {
        try {
          const r = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...tzAuthHeader() },
            body: JSON.stringify({ productId: params.orderId, qty: 1 }),
          });
          const j = await r.json();
          if (j?.order?.id) {
            router.replace(`/checkout/${j.order.id}`);
          }
        } catch {}
      })();
    }
  }, [params.orderId, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['order', params.orderId],
    queryFn: async () => (await fetch(`/api/orders?id=${params.orderId}`, { headers: { ...tzAuthHeader() } })).json(),
  });
  const order = data?.order;
  const product = data?.product;

  // Ultra-fast background preload for Binance Pay (0 latency instant checkout)
  useEffect(() => {
    if (!order?.id || order?.status !== 'PENDING') return;
    if (preloadedBinanceRef.current) return;

    preloadedPromiseRef.current = fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...tzAuthHeader() },
      body: JSON.stringify({ orderId: order.id, provider: 'BINANCE' }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.intent?.id) {
          preloadedBinanceRef.current = j.intent;
          preloadCacheRef.current.set('BINANCE', j.intent);
          qc.setQueryData(['intent', j.intent.id], { intent: j.intent });
          router.prefetch(`/pay/${j.intent.id}`);
        }
        return j;
      })
      .catch(() => null);
  }, [order?.id, order?.status, qc, router]);

  // Warmup provider intent on pointer enter / touch
  const warmProvider = useCallback((provider: string) => {
    if (!order?.id || order?.status !== 'PENDING' || preloadCacheRef.current.has(provider)) return;
    fetch('/api/payments/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...tzAuthHeader() },
      body: JSON.stringify({ orderId: order.id, provider }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.intent?.id) {
          preloadCacheRef.current.set(provider, j.intent);
          qc.setQueryData(['intent', j.intent.id], { intent: j.intent });
          router.prefetch(`/pay/${j.intent.id}`);
        }
      })
      .catch(() => null);
  }, [order?.id, order?.status, qc, router]);

  async function pay(provider: string) {
    if (paying) return;
    haptic('medium');

    // FAST-PATH 1: Instant 0-Latency Transition if intent is already pre-generated
    const cached = preloadCacheRef.current.get(provider) || (provider === 'BINANCE' ? preloadedBinanceRef.current : null);
    if (cached) {
      setPaying(provider);
      qc.setQueryData(['intent', cached.id], { intent: cached });
      router.push(`/pay/${cached.id}`);
      return;
    }

    // FAST-PATH 2: If Binance background promise is in-flight, await directly without re-fetching
    if (provider === 'BINANCE' && preloadedPromiseRef.current) {
      setPaying('BINANCE');
      try {
        const j = await preloadedPromiseRef.current;
        if (j?.intent) {
          qc.setQueryData(['intent', j.intent.id], { intent: j.intent });
          router.push(`/pay/${j.intent.id}`);
          return;
        }
      } catch {}
    }

    // Standard fallback path with immediate visual feedback
    setPaying(provider);
    try {
      const r = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tzAuthHeader() },
        body: JSON.stringify({ orderId: params.orderId, provider }),
      });
      const j = await r.json();
      if (!r.ok) {
        setToast(j.error ?? 'Payment failed');
        haptic('error');
        setPaying(null);
        return;
      }
      if (j.intent) {
        qc.setQueryData(['intent', j.intent.id], { intent: j.intent });
      }
      if (provider === 'STARS' && j.invoiceLink) {
        const w = (window as any)?.Telegram?.WebApp;
        if (w?.openInvoice) w.openInvoice(j.invoiceLink, () => router.push(`/pay/${j.intent.id}`));
        else router.push(`/pay/${j.intent.id}`);
      } else {
        router.push(`/pay/${j.intent.id}`);
      }
    } catch {
      setToast('Network error, please retry');
      haptic('error');
      setPaying(null);
    }
  }

  if (data?.error) {
    return (
      <main className="space-y-3 pt-4">
        <Card className="p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Package size={24} />
          </div>
          <h1 className="mt-3 text-[16px] font-bold text-gray-900">Order Not Found</h1>
          <p className="mt-1 text-xs text-gray-500">
            This order does not exist or may have expired.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => router.push('/home')}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
            >
              <ShoppingBag size={15} />
              <span>Browse Products</span>
            </button>
            <button
              onClick={() => router.push('/orders')}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              <ClipboardList size={15} />
              <span>My Orders</span>
            </button>
          </div>
        </Card>
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-white border border-slate-200 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </main>
    );
  }

  if (isLoading || !order)
    return (
      <main className="space-y-3 pt-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </main>
    );

  return (
    <main className="space-y-3 pt-4">
      {/* Order summary */}
      <Card className="p-5">
        <h1 className="text-[15px] font-bold text-gray-900">Order summary</h1>
        <div className="mt-3 flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-gray-50 p-1.5">
            <CatLogo
              logo={product?.logo}
              emoji="📦"
              name={product?.title ?? order.productId}
              size={44}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-gray-900">
              {product?.title ?? order.productId}
            </p>
            <p className="text-[13px] text-gray-500">Quantity × {order.qty}</p>
          </div>
        </div>
        <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <dt>
              Unit × {order.qty}
            </dt>
            <dd className="font-semibold tabular-nums">{money(order.unitPrice)} each</dd>
          </div>
          <div className="flex justify-between text-base font-extrabold text-gray-900">
            <dt>Total due</dt>
            <dd className="tabular-nums">{money(order.total)}</dd>
          </div>
        </dl>
      </Card>

      {/* Payment methods */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-[#4A90D9]" />
          <h2 className="text-[15px] font-bold text-gray-900">Payment method</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          All payment methods are verified and processed instantly
        </p>

        <ul className="mt-3 space-y-2">
          {METHODS.map((m) => {
            const active = paying === m.id;
            const isBinance = m.id === 'BINANCE';
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pay(m.id)}
                  onPointerDown={() => {
                    haptic('light');
                    warmProvider(m.id);
                  }}
                  onMouseEnter={() => warmProvider(m.id)}
                  disabled={paying !== null && paying !== m.id}
                  style={{ touchAction: 'manipulation' }}
                  className={`flex w-full items-center gap-3 rounded-[14px] border border-gray-100 bg-gray-50 px-3.5 py-3 text-left transition-all duration-75 tg-press hover:bg-gray-100 active:scale-[0.98] ${
                    isBinance ? 'hover:border-amber-300 active:bg-amber-50/70 active:border-amber-400' : ''
                  } ${active ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300' : ''} disabled:opacity-70`}
                >
                  <img
                    src={m.icon}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    style={{ width: 28, height: 28, objectFit: 'contain' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[15px] font-bold text-gray-900">
                      {m.label}
                      {m.badge && (
                        <span className="tight rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">
                          {m.badge}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{m.hint}</span>
                  </span>
                  {active ? (
                    <Loader2 size={18} className="shrink-0 animate-spin text-amber-500" />
                  ) : (
                    <ChevronRight size={18} className={`shrink-0 transition-transform ${isBinance ? 'text-gray-400 group-hover:translate-x-0.5' : 'text-gray-300'}`} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-400">
          <ShieldCheck size={13} className="mt-px shrink-0" />
          Amounts are locked server-side. Underpayments are flagged for manual review — never
          send a different amount.
        </p>
      </Card>

      <button
        onClick={() => { haptic('light'); router.back(); }}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
      >
        <ArrowLeft size={14} />
        <span>Back</span>
      </button>

      <Toast msg={toast} />
    </main>
  );
}
