'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Zap, ShieldCheck, ShoppingBag, BellRing, Check, ArrowLeft, ExternalLink } from 'lucide-react';
import { Card, StockBadge, Skeleton, Toast, CatLogo } from '@/components/ui';
import { backButton, haptic, mainButton, tzAuthHeader } from '@/lib/tma';

type Tier = { minQty: number; unitPrice: number };

function tierRange(tiers: Tier[], i: number) {
  const cur = tiers[i];
  const next = tiers[i + 1];
  if (!next) return `${cur.minQty}+ pcs`;
  if (next.minQty === cur.minQty + 1) return `${cur.minQty} pc`;
  return `${cur.minQty}–${next.minQty - 1} pcs`;
}

type SpecRow = { label?: string; val: string; url?: string };

function parseContents(raw?: string): SpecRow[] {
  if (!raw) return [];
  const sentences = raw
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 0);

  return sentences.map((s) => {
    const colonIdx = s.indexOf(':');
    const urlMatch = s.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[0].replace(/[.,;]$/, '') : undefined;

    if (colonIdx > 0 && colonIdx < 30) {
      const label = s.slice(0, colonIdx).trim();
      const val = s.slice(colonIdx + 1).trim();
      return { label, val, url };
    }
    return { val: s, url };
  });
}

export default function ProductDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1');
  const [toast, setToast] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => backButton(() => router.back()), [router]);
  const { data, isLoading } = useQuery({
    queryKey: ['p', params.id],
    queryFn: async () => (await fetch(`/api/products/${params.id}`)).json(),
  });
  const { data: brandingData } = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => (await fetch('/api/settings/public')).json(),
    staleTime: 60000,
  });
  const storeName = brandingData?.storeName || 'TZ Store';
  const p = data?.product;
  const tiers: Tier[] = useMemo(
    () => [...(p?.tiers ?? [])].sort((a: Tier, b: Tier) => a.minQty - b.minQty),
    [p]
  );
  const oos = !!p && p.stock <= 0;
  const maxStock = p ? Math.max(0, p.stock) : 0;
  const maxQty = Math.max(1, Math.min(maxStock || 1, 100));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 2500);
  };

  const updateQty = (val: number) => {
    const clamped = Math.max(1, Math.min(maxQty, val));
    setQty(clamped);
    setQtyText(String(clamped));
  };

  const handleDecrease = () => {
    if (qty <= 1) {
      showToast('Minimum order is 1 pc');
      haptic('warning');
      return;
    }
    updateQty(qty - 1);
    haptic('light');
  };

  const handleIncrease = () => {
    if (qty >= maxQty) {
      showToast(maxQty <= 1 ? 'Only 1 pc available in stock' : `Maximum available stock is ${maxQty} pcs`);
      haptic('warning');
      return;
    }
    updateQty(qty + 1);
    haptic('light');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      setQtyText('');
      return;
    }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) {
      setQtyText('1');
      setQty(1);
      return;
    }
    if (n > maxQty) {
      showToast(maxQty <= 1 ? 'Only 1 pc available in stock' : `Only ${maxQty} pcs available in stock`);
      haptic('warning');
      setQty(maxQty);
      setQtyText(String(maxQty));
      return;
    }
    setQty(n);
    setQtyText(String(n));
  };

  const handleInputBlur = () => {
    if (qtyText === '' || parseInt(qtyText, 10) < 1) {
      updateQty(1);
    } else {
      updateQty(parseInt(qtyText, 10));
    }
  };

  // Instant 0ms local quote calculation always in lockstep with qty
  const localQuote = useMemo(() => {
    if (!p) return null;
    let unit = p.priceUsdt;
    if (tiers.length > 0) {
      for (const t of tiers) {
        if (qty >= t.minQty) unit = t.unitPrice;
      }
    }
    const tot = Math.round(unit * qty * 100) / 100;
    const baseTot = Math.round(p.priceUsdt * qty * 100) / 100;
    return {
      productId: p.id,
      qty,
      unitPrice: unit,
      total: tot,
      savings: Math.max(0, Math.round((baseTot - tot) * 100) / 100),
    };
  }, [p, qty, tiers]);

  const total = localQuote?.total ?? (p ? Math.round(p.priceUsdt * qty * 100) / 100 : 0);
  const unit = localQuote?.unitPrice ?? p?.priceUsdt ?? 0;
  const savings = localQuote?.savings ?? 0;

  useEffect(() => {
    if (!p || oos) return;
    return mainButton(`Buy ${qty} • $${total.toFixed(2)}`, () => go());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, oos, qty, total]);

  async function go() {
    if (buying || !p || oos) return;
    const orderQty = Math.max(1, Math.min(maxQty, qty));
    setBuying(true);
    haptic('light');
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tzAuthHeader() },
        body: JSON.stringify({ productId: p.id, qty: orderQty }),
      });
      const j = await r.json();
      if (!r.ok) {
        showToast(j.error ?? 'Order failed');
        haptic('error');
        return;
      }
      // Instant 0ms pre-seed for checkout page
      qc.setQueryData(['order', j.order.id], {
        order: j.order,
        product: { id: p.id, title: p.title, logo: p.logo, categorySlug: p.categorySlug },
      });
      router.push(`/checkout/${j.order.id}`);
    } finally {
      setBuying(false);
    }
  }

  async function notify() {
    await fetch('/api/notify-me', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...tzAuthHeader() },
      body: JSON.stringify({ productId: p.id }),
    });
    setToast('We will notify you when restocked');
    haptic('success');
  }

  if (isLoading)
    return (
      <main className="space-y-3 pt-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-44" />
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
      </main>
    );
  if (!p)
    return (
      <main className="pt-4">
        <Card>Product not found.</Card>
      </main>
    );

  const activeTier = tiers.reduce(
    (acc: number, t: Tier, i: number) => (qty >= t.minQty ? i : acc),
    -1
  );

  const specs = parseContents(p.contents);

  return (
    <main className="space-y-3 pt-2 pb-24">
      {toast && <Toast msg={toast} />}

      {/* Hero */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-2xl bg-slate-50 border border-slate-200/70 p-2.5 shadow-sm">
            <CatLogo logo={(p as any).logo} emoji="" name={p.title} size={54} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {(p.categorySlug ?? '').replace('-', ' ')}
            </p>
            <h1 className="mt-0.5 text-[20px] font-extrabold leading-tight tracking-tight text-slate-900">
              {p.title}
              {oos && <span className="text-slate-400 font-normal"> (out of stock)</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StockBadge stock={p.stock} />
              {p.stock > 0 && p.stock <= 5 && (
                <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Only {p.stock} left
                </span>
              )}
              {tiers.length > 0 && (
                <span className="rounded-full bg-blue-50 border border-blue-200/60 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  Bulk discounts
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Price per pc</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-[28px] font-black leading-none text-slate-900 tracking-tight">
                ${unit.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                USDT
              </span>
            </div>
          </div>
          {savings > 0 ? (
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700">
              Save ${savings.toFixed(2)}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Best price applied at checkout</span>
          )}
        </div>
      </Card>

      {/* About + delivery */}
      <Card className="p-5">
        <h2 className="text-[15px] font-bold text-slate-900">About this product</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{p.desc}</p>

        {specs.length > 0 && (
          <div className="mt-3.5 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Delivery Specifications
            </p>
            <div className="divide-y divide-slate-200/70">
              {specs.map((item, idx) => (
                <div
                  key={idx}
                  className="py-1.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs leading-snug"
                >
                  {item.label ? (
                    <span className="font-semibold text-slate-800 shrink-0">{item.label}</span>
                  ) : null}
                  <span className={item.label ? 'text-right text-slate-600' : 'text-slate-600 w-full'}>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2481CC] font-semibold underline underline-offset-2 hover:text-[#19639f] inline-flex items-center gap-0.5"
                      >
                        <span>{item.val.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    ) : (
                      item.val
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3.5 space-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Zap size={14} className="shrink-0 text-amber-500" />
            <span><b className="font-semibold text-slate-900">Instant Delivery</b> — Credentials automatically sent upon payment.</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
            <span><b className="font-semibold text-slate-900">Buyer Protection</b> — Full warranty covered by {storeName} support.</span>
          </div>
        </div>
      </Card>

      {/* Bulk pricing */}
      {tiers.length > 0 && !oos && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-slate-900">Bulk pricing</h2>
            <span className="text-xs text-slate-400">per pc</span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {tiers.map((t: Tier, i: number) => {
              const active = i === activeTier;
              return (
                <li
                  key={t.minQty}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                    active ? 'bg-blue-50 font-semibold text-slate-900' : 'text-slate-600'
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs">
                    {tierRange(tiers, i)}
                    {active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#2481CC] px-2 py-0.5 text-[10px] font-bold text-white">
                        <Check size={10} /> Applied
                      </span>
                    )}
                  </span>
                  <span className="font-bold text-slate-900">${t.unitPrice.toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Quantity + Purchase Card */}
      {!oos ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">Select quantity</h2>
              <p className="mt-0.5 text-xs text-slate-500">1–100 pcs • {maxStock} available</p>
            </div>
            <div className="flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={handleDecrease}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95 ${
                  qty <= 1 ? 'opacity-30' : ''
                }`}
              >
                <Minus size={15} />
              </button>
              <input
                aria-label="Enter quantity 1 to 100"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={qtyText}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="w-12 bg-transparent text-center text-base font-extrabold tabular-nums text-slate-900 outline-none"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={handleIncrease}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95 ${
                  qty >= maxQty ? 'opacity-30' : ''
                }`}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Unit × {qty}</span>
              <span className="font-semibold text-slate-800 tabular-nums">${unit.toFixed(2)} each</span>
            </div>
            {savings > 0 && (
              <div className="flex justify-between text-xs font-semibold text-emerald-600">
                <span>Bulk savings</span>
                <span className="tabular-nums">−${savings.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-900">Total</span>
              <span className="text-2xl font-black text-slate-900 tabular-nums tracking-tight">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            onClick={go}
            disabled={buying}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#57C25E] hover:bg-[#4eb354] active:scale-[0.98] py-3.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-50"
          >
            <ShoppingBag size={16} />
            <span>{buying ? 'Preparing checkout…' : `Buy Now • $${total.toFixed(2)}`}</span>
          </button>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck size={13} className="text-slate-400" />
            <span>Encrypted checkout • Instant automated delivery</span>
          </div>
        </Card>
      ) : (
        <Card className="p-5 text-center">
          <BellRing size={28} className="mx-auto text-slate-300" />
          <h2 className="mt-2 text-[15px] font-bold text-slate-900">Out of stock</h2>
          <p className="mt-1 text-xs text-slate-500">
            This item is currently sold out. We will notify you as soon as new stock is added.
          </p>
          <button
            onClick={notify}
            className="mt-4 w-full rounded-xl bg-[#2481CC] hover:bg-[#1b6cae] py-3 text-sm font-semibold text-white transition active:scale-95"
          >
            Notify me on restock
          </button>
        </Card>
      )}

      {/* Back Button */}
      <button
        onClick={() => { haptic('light'); router.back(); }}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
      >
        <ArrowLeft size={14} />
        <span>Back to Products</span>
      </button>
    </main>
  );
}
