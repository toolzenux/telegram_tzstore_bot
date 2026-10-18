'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { 
  ShoppingBag, 
  CreditCard, 
  Gift, 
  Package, 
  Headphones, 
  Info, 
  Send, 
  Search, 
  Sparkles, 
  Copy, 
  Check, 
  ArrowRight, 
  ChevronRight, 
  X, 
  CheckCircle2, 
  Wallet,
  ArrowLeft
} from 'lucide-react';
import { Card, Skeleton, Toast, CatLogo, PricePill, StockBadge } from '@/components/ui';
import { haptic, mainButton, backButton, tzAuthHeader } from '@/lib/tma';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [view, setView] = useState<'landing' | 'products'>('landing');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<{ name: string; id: string | number; username?: string; photo?: string } | null>(null);
  const [branding, setBranding] = useState({ storeName: 'TZ Store', supportUrl: 'https://t.me/TzStore_Support', channelUrl: 'https://t.me/TZStoreChannel' });

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === 'object') setBranding((b) => ({ ...b, ...d }));
      })
      .catch(() => {});
  }, []);

  // Sync with URL query parameter ?view=products if opened directly
  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'products') {
      setView('products');
    }
  }, [searchParams]);

  // Read Telegram User Context
  useEffect(() => {
    try {
      const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
      if (tg) {
        setUser({
          name: `${tg.first_name ?? ''} ${tg.last_name ?? ''}`.trim() || 'TZ User',
          id: tg.id,
          username: tg.username ? `@${tg.username}` : undefined,
          photo: tg.photo_url,
        });
      }
    } catch {}
  }, []);

  // Fetch live authenticated user profile & balance
  const userAccountQuery = useQuery({
    queryKey: ['user-account', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/me`, {
        headers: { ...tzAuthHeader() },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const walletBalance = userAccountQuery.data?.walletBalance ?? 0;
  const referralEarnings = userAccountQuery.data?.referralEarnings ?? 0;

  // Native Telegram Back Button integration when in Products view
  useEffect(() => {
    if (view === 'products') {
      const cleanup = backButton(() => {
        haptic('light');
        setView('landing');
      });
      return cleanup;
    }
  }, [view]);

  // MainButton integration
  useEffect(() => mainButton('My Orders', () => {
    haptic('light');
    router.push('/orders');
  }), [router]);

  // 1. Fetch Categories with 60s stale time (fast cache)
  const cats = useQuery({
    queryKey: ['cats'],
    queryFn: async () => (await fetch('/api/categories')).json(),
    staleTime: 60000,
  });

  // 2. Fetch Restocks Feed
  const feed = useQuery({
    queryKey: ['feed'],
    queryFn: async () => (await fetch('/api/feed/restocks')).json(),
    staleTime: 60000,
  });

  // 3. Zero-Latency Preloader: Rapid single-request fetch for ALL products on mount
  const allProductsQuery = useQuery({
    queryKey: ['all-products-catalog'],
    queryFn: async () => {
      const res = await (await fetch('/api/products')).json();
      const list: any[] = res?.products || [];
      
      // Seed individual product caches for instantaneous /p/[id] navigation (0ms)
      for (const p of list) {
        qc.setQueryData(['p', p.id], (old: any) => old ?? { product: p, source: 'preloaded' });
      }

      return list;
    },
    staleTime: 60000,
  });

  const categories = cats.data?.categories || [];
  const allProducts = allProductsQuery.data || [];

  // Filter products by search query and category pill with 0ms in-memory latency
  const filteredProducts = useMemo(() => {
    let list = allProducts;
    if (selectedCat !== 'all') {
      list = list.filter((p: any) => p.categorySlug === selectedCat);
    }
    if (q.trim()) {
      const search = q.toLowerCase().trim();
      list = list.filter((p: any) => 
        (p.title || '').toLowerCase().includes(search) ||
        (p.description || '').toLowerCase().includes(search) ||
        (p.categoryName || '').toLowerCase().includes(search)
      );
    }
    return list;
  }, [allProducts, selectedCat, q]);

  // Instant prefetch & pre-seed for a single product when hovering/touching
  const preseedProduct = (p: any) => {
    qc.setQueryData(['p', p.id], (old: any) => old ?? { product: p, source: 'preloaded' });
  };

  const handleCopyId = () => {
    if (!user?.id) return;
    try {
      navigator.clipboard.writeText(String(user.id));
      setCopied(true);
      haptic('success');
      setToast('Telegram ID copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const openProductsCatalog = (catSlug?: string) => {
    haptic('medium');
    setSelectedCat(catSlug || 'all');
    setView('products');
  };

  const name = user?.name ?? 'Guest';
  const id = user?.id ?? '—';

  return (
    <main className="pt-2 pb-6 space-y-3">
      {view === 'landing' ? (
        <div className="space-y-3 animate-in fade-in duration-150">
          
          {/* 1. Sleek Telegram User Profile Header Card */}
          <div className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] border border-black/[0.04]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  {user?.photo ? (
                    <img 
                      src={user.photo} 
                      alt={name} 
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-500/20" 
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#2481CC] to-[#4A90D9] text-white font-black text-lg flex items-center justify-center shadow-inner">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                </div>
                
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 leading-tight">
                    <span className="font-extrabold text-[16px] text-gray-900 truncate">{name}</span>
                    <CheckCircle2 size={15} className="text-[#2481CC] fill-[#2481CC]/15 shrink-0" />
                  </div>
                  <div className="text-[12px] text-gray-500 mt-0.5 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Active Buyer • Verified</span>
                  </div>
                </div>
              </div>

              {/* ID Pill with 1-Tap Copy */}
              <button
                type="button"
                onClick={handleCopyId}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100/80 hover:bg-gray-200/80 active:scale-95 text-gray-700 text-xs font-mono font-medium transition touch-manipulation"
                title="Copy Telegram ID"
              >
                <span>🪪</span>
                <span className="truncate max-w-[70px] sm:max-w-none">{id}</span>
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-gray-400" />}
              </button>
            </div>

            {/* 2. Executive Crypto Wallet Card */}
            <div className="mt-4 pt-3.5 border-t border-gray-100 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-3 border border-emerald-100/70">
                <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800">
                  <span className="flex items-center gap-1">💳 Wallet Balance</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[19px] font-black text-gray-900 tracking-tight">${walletBalance.toFixed(2)}</span>
                  <span className="text-[11px] font-bold text-emerald-600">USDT</span>
                </div>
                <div className="mt-1.5">
                  <Link 
                    href="/deposit" 
                    onClick={() => haptic('light')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2481CC] hover:underline"
                  >
                    + Top Up
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-50/80 to-orange-50/60 p-3 border border-amber-100/70">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800">
                  <span className="flex items-center gap-1">🎁 Referral Earnings</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[19px] font-black text-gray-900 tracking-tight">${referralEarnings.toFixed(2)}</span>
                  <span className="text-[11px] font-bold text-amber-600">USDT</span>
                </div>
                <div className="mt-1.5">
                  <Link 
                    href="/referrals" 
                    onClick={() => haptic('light')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:underline"
                  >
                    Invite &amp; Earn →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Section Title */}
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[13px] font-bold text-gray-700 tracking-tight">Choose an option below 👇</span>
          </div>

          {/* 4. HERO PRIMARY CARD: "Category Product" (High-Conversion Area Capture & Click Psychology) */}
          <div
            role="button"
            tabIndex={0}
            onTouchStart={() => openProductsCatalog()}
            onClick={() => openProductsCatalog()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProductsCatalog();
              }
            }}
            className="w-full relative overflow-hidden rounded-[24px] bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 p-4 sm:p-5 text-white shadow-[0_8px_24px_rgba(16,185,129,0.32)] border border-emerald-300/30 tg-press active:scale-[0.98] transition-all duration-150 touch-manipulation group text-left cursor-pointer select-none"
          >
            {/* Ambient Background Glow & Shimmer Elements */}
            <div className="absolute right-0 top-0 -mt-6 -mr-6 w-36 h-36 rounded-full bg-white/15 blur-2xl pointer-events-none" />
            <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-emerald-400/20 blur-xl pointer-events-none" />
            <div className="absolute top-0 right-1/4 w-20 h-20 rounded-full bg-teal-300/10 blur-lg pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-3">
              {/* Top Row: Icon + Title + Live Pulsing Catalog Badge + Chevron */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-[52px] h-[52px] rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] border border-white/25 shrink-0 group-hover:scale-105 transition-transform duration-200">
                    🛍️
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[18px] font-black text-white tracking-tight leading-tight">
                        Category Product
                      </h2>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-300/35 backdrop-blur-sm shadow-sm">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">
                          LIVE CATALOG
                        </span>
                      </div>
                    </div>
                    <p className="text-[12.5px] text-white/90 font-medium mt-1 leading-snug">
                      Browse all digital goods • Instant 24/7 delivery
                    </p>
                  </div>
                </div>

                {/* Right Arrow Bubble */}
                <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shrink-0 group-hover:bg-white group-hover:text-emerald-700 group-hover:translate-x-1 transition-all duration-200 shadow-sm mt-0.5">
                  <ChevronRight size={19} className="stroke-[2.5]" />
                </div>
              </div>

              {/* Middle Row: Click Psychology Category Previews & Value Tags */}
              <div className="flex items-center gap-1.5 overflow-hidden flex-wrap pt-0.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/15 backdrop-blur-md text-[11px] font-semibold text-white border border-white/15 shadow-sm">
                  ⚡ Auto-Delivery
                </span>
                {categories.slice(0, 3).map((c: any) => (
                  <span
                    key={c.slug}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openProductsCatalog(c.slug);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md text-[11px] font-semibold text-white border border-white/15 shadow-sm transition cursor-pointer"
                  >
                    <span>{c.emoji || '📦'}</span>
                    <span>{c.name}</span>
                  </span>
                ))}
                {categories.length > 3 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openProductsCatalog('all');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-black/25 hover:bg-black/35 active:scale-95 backdrop-blur-sm text-[10.5px] font-bold text-emerald-200 border border-white/10 transition cursor-pointer"
                  >
                    +{categories.length - 3} More
                  </span>
                )}
              </div>

              {/* Bottom Conversion Action Bar: Irresistible Click Magnet & Social Proof */}
              <div className="pt-2.5 mt-0.5 border-t border-white/15 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11.5px] text-emerald-100 font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" />
                  <span>
                    {allProducts.length ? `${allProducts.length}+ digital goods ready` : 'Instant 24/7 Vault Delivery'}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-emerald-800 text-[12px] font-black shadow-[0_2px_8px_rgba(0,0,0,0.12)] group-hover:bg-emerald-50 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-all">
                  <span>Browse Catalog</span>
                  <ArrowRight size={13} className="stroke-[3]" />
                </div>
              </div>
            </div>
          </div>

          {/* 5. Modern 2-Column Action Grid (Vibrant curated gradients matching modern TMA) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* 💲 Deposit */}
            <Link
              href="/deposit"
              onClick={() => haptic('light')}
              className="rounded-[18px] bg-gradient-to-br from-[#2481CC] to-[#1668A6] p-3.5 text-white shadow-[0_2px_10px_rgba(36,129,204,0.22)] tg-press active:scale-[0.97] transition-all touch-manipulation block"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg mb-2">
                💲
              </div>
              <div className="text-[15px] font-bold leading-tight">Deposit</div>
              <div className="text-[11px] text-white/80 mt-0.5">Binance UID &amp; Crypto</div>
            </Link>

            {/* 🎁 Referrals */}
            <Link
              href="/referrals"
              onClick={() => haptic('light')}
              className="rounded-[18px] bg-gradient-to-br from-amber-500 to-orange-500 p-3.5 text-white shadow-[0_2px_10px_rgba(245,158,11,0.22)] tg-press active:scale-[0.97] transition-all touch-manipulation block"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg mb-2">
                🎁
              </div>
              <div className="text-[15px] font-bold leading-tight">Referrals</div>
              <div className="text-[11px] text-white/80 mt-0.5">Earn 10% on Invites</div>
            </Link>

            {/* 📦 My Orders */}
            <Link
              href="/orders"
              onClick={() => haptic('light')}
              className="rounded-[18px] bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 text-white shadow-[0_2px_10px_rgba(99,102,241,0.22)] tg-press active:scale-[0.97] transition-all touch-manipulation block"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg mb-2">
                📦
              </div>
              <div className="text-[15px] font-bold leading-tight">My Orders</div>
              <div className="text-[11px] text-white/80 mt-0.5">Vault Keys &amp; History</div>
            </Link>

            {/* 🎧 Support */}
            <a
              href={branding.supportUrl || 'https://t.me/TzStore_Support'}
              target="_blank"
              rel="noreferrer"
              onClick={() => haptic('light')}
              className="rounded-[18px] bg-gradient-to-br from-slate-700 to-slate-900 p-3.5 text-white shadow-[0_2px_10px_rgba(51,65,85,0.2)] tg-press active:scale-[0.97] transition-all touch-manipulation block"
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg mb-2">
                🎧
              </div>
              <div className="text-[15px] font-bold leading-tight">Support</div>
              <div className="text-[11px] text-white/80 mt-0.5">24/7 Official Help</div>
            </a>

            {/* 🔎 About */}
            <Link
              href="/about"
              onClick={() => haptic('light')}
              className="col-span-2 rounded-[18px] bg-gradient-to-br from-cyan-600 to-blue-700 p-3.5 text-white shadow-[0_2px_10px_rgba(2,132,199,0.2)] tg-press active:scale-[0.97] transition-all touch-manipulation flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shrink-0">
                  🔎
                </div>
                <div>
                  <div className="text-[15px] font-bold leading-tight">About {branding.storeName || 'TZ Store'}</div>
                  <div className="text-[11px] text-white/80">Rules, instant auto-delivery &amp; guarantees</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-white/80" />
            </Link>
          </div>

        </div>
      ) : (
        /* =========================================================================
           CATEGORY PRODUCTS CATALOG (ZERO LATENCY IN-MEMORY BROWSING)
           ========================================================================= */
        <div className="space-y-3 animate-in fade-in duration-150">
          
          {/* Top Bar with Instant Back button */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { haptic('light'); setView('landing'); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-bold shadow-sm tg-press active:scale-95 transition touch-manipulation"
            >
              <ArrowLeft size={14} /> Back to Menu
            </button>
            <div className="text-right">
              <span className="text-[15px] font-extrabold text-gray-900">Digital Catalog</span>
              <span className="block text-[10px] font-semibold text-emerald-600">● 24/7 Auto-Delivery</span>
            </div>
          </div>

          {/* Real-time Instant Search Input */}
          <div className="relative">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              aria-label="Search products"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search GitHub, Gemini, VPN, Telegram…"
              className="w-full rounded-[16px] bg-white pl-10 pr-9 py-3 text-[14px] shadow-sm border border-gray-200/80 outline-none focus:border-[#2481CC] transition"
            />
            {q && (
              <button 
                type="button" 
                onClick={() => setQ('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Horizontally Scrollable Category Filter Pills */}
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 py-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { haptic('light'); setSelectedCat('all'); }}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition tg-press active:scale-95 touch-manipulation ${
                selectedCat === 'all'
                  ? 'bg-[#2481CC] text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              ✨ All Products ({allProducts.length})
            </button>
            {categories.map((c: any) => {
              const count = allProducts.filter((p: any) => p.categorySlug === c.slug).length;
              const isSelected = selectedCat === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => { haptic('light'); setSelectedCat(c.slug); }}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition tg-press active:scale-95 touch-manipulation ${
                    isSelected
                      ? 'bg-[#2481CC] text-white shadow-sm'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{c.emoji}</span>
                  <span>{c.name}</span>
                  {count > 0 && <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20' : 'bg-gray-100'}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Restock Announcement Feed (if any) */}
          {(feed.data?.restocks ?? []).slice(0, 1).map((r: any) => (
            <div key={r.id} className="rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-2.5 flex items-center justify-between text-xs">
              <span className="font-medium text-emerald-900 truncate">🎁 Restock: {r.message}</span>
              <Link href="/feed" className="shrink-0 font-bold text-[#2481CC] underline ml-2">View →</Link>
            </div>
          ))}

          {/* Product Items List (Loaded with 0ms in-memory cache) */}
          {allProductsQuery.isLoading && allProducts.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center border border-gray-200 shadow-sm space-y-2">
              <div className="text-3xl">🔍</div>
              <div className="text-[15px] font-bold text-gray-800">No products found</div>
              <p className="text-xs text-gray-500">Try searching a different keyword or category.</p>
              <button
                type="button"
                onClick={() => { setQ(''); setSelectedCat('all'); }}
                className="mt-2 px-3 py-1.5 rounded-xl bg-gray-100 text-xs font-bold text-gray-700 hover:bg-gray-200"
              >
                Reset Search
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredProducts.map((p: any) => (
                <Link
                  key={p.id}
                  href={`/p/${p.id}`}
                  onClick={() => haptic('light')}
                  onTouchStart={() => preseedProduct(p)}
                  onMouseEnter={() => preseedProduct(p)}
                  className="block rounded-[18px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] tg-press active:scale-[0.98] transition hover:shadow-md touch-manipulation"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      <CatLogo logo={p.logo} emoji={p.categoryEmoji || '📦'} name={p.title} size={38} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[15px] text-gray-900 truncate">{p.title}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1">
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

          {/* Bottom Back Button */}
          <button
            type="button"
            onClick={() => { haptic('light'); setView('landing'); }}
            className="w-full mt-4 rounded-[16px] bg-white border border-gray-200 py-3 text-[14px] font-bold text-gray-700 shadow-sm tg-press active:scale-[0.98] transition touch-manipulation"
          >
            ← Back to Main Menu
          </button>

        </div>
      )}

      <Toast msg={toast} />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="pt-4 space-y-3"><Skeleton className="h-40" /></div>}>
      <HomeContent />
    </Suspense>
  );
}
