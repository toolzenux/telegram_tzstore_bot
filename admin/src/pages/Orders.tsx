import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Package,
  CreditCard,
  Trash2,
  User,
  DollarSign,
  ShoppingBag,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  tzGetTzOrders,
  tzFulfillOrder,
  tzRefundOrder,
  tzClearOrders,
  tzDeleteOrder,
  tzGetProducts,
  type TzOrder,
  STORE_ORIGIN,
} from '../tzstore';
import { Badge, Button, Card, Drawer, Empty, Input, Select, Skeleton, toast } from '../ui';

// Professional fintech status configuration
function getStatusConfig(status: string) {
  switch (status) {
    case 'DELIVERED':
    case 'FULFILLED':
    case 'CONFIRMED':
    case 'PAID':
      return {
        label: 'Delivered',
        tone: 'green' as const,
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        dot: 'bg-emerald-500',
        icon: CheckCircle2,
      };
    case 'NEEDS_REVIEW':
      return {
        label: 'Needs Review',
        tone: 'blue' as const,
        bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        dot: 'bg-blue-500',
        icon: AlertCircle,
      };
    case 'PENDING':
      return {
        label: 'Pending Payment',
        tone: 'amber' as const,
        bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        dot: 'bg-amber-500',
        icon: Clock,
      };
    case 'REFUNDING':
      return {
        label: 'Refunding',
        tone: 'blue' as const,
        bg: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
        dot: 'bg-purple-500',
        icon: RefreshCw,
      };
    case 'CANCELLED':
    case 'EXPIRED':
    default:
      return {
        label: status === 'EXPIRED' ? 'Expired' : 'Cancelled',
        tone: 'gray' as const,
        bg: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        dot: 'bg-slate-400',
        icon: XCircle,
      };
  }
}

// Payment method display configuration
function getPaymentBadge(provider?: string, asset?: string) {
  const p = (provider || '').toUpperCase();
  if (p === 'BINANCE') {
    return {
      name: 'Binance Pay',
      tag: 'UID Deposit',
      className: 'bg-amber-50 text-amber-800 border-amber-300/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/60',
    };
  }
  if (p === 'TRC20') {
    return {
      name: 'USDT',
      tag: 'TRC-20',
      className: 'bg-teal-50 text-teal-800 border-teal-300/60 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-700/60',
    };
  }
  if (p === 'BEP20') {
    return {
      name: 'USDT',
      tag: 'BSC / BEP-20',
      className: 'bg-yellow-50 text-yellow-800 border-yellow-300/60 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-700/60',
    };
  }
  if (p === 'STARS') {
    return {
      name: 'Telegram Stars',
      tag: 'In-App',
      className: 'bg-indigo-50 text-indigo-800 border-indigo-300/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700/60',
    };
  }
  if (p === 'BTC') {
    return {
      name: 'Bitcoin',
      tag: 'Native BTC',
      className: 'bg-orange-50 text-orange-800 border-orange-300/60 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700/60',
    };
  }
  return {
    name: provider || 'Pending',
    tag: asset || 'Direct',
    className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
}

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const book = useQuery({
    queryKey: ['tz-orders'],
    queryFn: tzGetTzOrders,
    refetchInterval: 10000,
  });

  const prods = useQuery({ queryKey: ['tz-products'], queryFn: tzGetProducts });
  const pname = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of prods.data?.products ?? []) m[p.id] = p.title;
    return m;
  }, [prods.data]);

  const intents = useMemo(() => {
    const m: Record<string, { provider: string; asset: string; status: string; txHash?: string; address?: string; expiresAt: string }> = {};
    for (const i of book.data?.intents ?? []) m[i.orderId] = i;
    return m;
  }, [book.data]);

  // Copy helper with brief visual state
  const copyText = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast(`Copied: ${text.slice(0, 16)}${text.length > 16 ? '...' : ''}`);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  // Filtered rows
  const allOrders = book.data?.orders ?? [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allOrders.filter((o) => {
      const it = intents[o.id];
      if (statusFilter && o.status !== statusFilter) return false;
      if (methodFilter && (it?.provider ?? '—') !== methodFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.userTg.toLowerCase().includes(q) ||
        o.productId.toLowerCase().includes(q) ||
        (pname[o.productId] ?? '').toLowerCase().includes(q) ||
        (it?.txHash ?? '').toLowerCase().includes(q)
      );
    });
  }, [allOrders, intents, search, statusFilter, methodFilter, pname]);

  // Key KPI metrics
  const stats = useMemo(() => {
    const totalCount = allOrders.length;
    const deliveredCount = allOrders.filter((o) => ['DELIVERED', 'FULFILLED', 'PAID'].includes(o.status)).length;
    const pendingCount = allOrders.filter((o) => o.status === 'PENDING').length;
    const reviewCount = allOrders.filter((o) => o.status === 'NEEDS_REVIEW').length;
    const revenue = Number(book.data?.revenue ?? 0);
    return { totalCount, deliveredCount, pendingCount, reviewCount, revenue };
  }, [allOrders, book.data?.revenue]);

  const sel: TzOrder | undefined = allOrders.find((o) => o.id === detail);
  const selIntent = detail ? intents[detail] : undefined;

  async function fulfill() {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await tzFulfillOrder(detail);
      toast(r.status === 'DELIVERED' ? 'Order delivered successfully' : `Order status: ${r.status}`);
      book.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Fulfill request failed');
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!detail || !confirm('Refund this order? Stock will be restored to vault automatically.')) return;
    setBusy(true);
    try {
      await tzRefundOrder(detail);
      toast('Refund processed. Inventory restored.');
      book.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Refund request failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleClearOrders() {
    if (!confirm('Clear all test/demo orders? This will reset the order book to a clean production state.')) return;
    setBusy(true);
    try {
      await tzClearOrders();
      toast('Order book cleared successfully');
      setDetail(null);
      book.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to clear orders');
    } finally {
      setBusy(false);
    }
  }

  const statusTabs = [
    { label: 'All', value: '', count: allOrders.length },
    { label: 'Pending', value: 'PENDING', count: stats.pendingCount },
    { label: 'Needs Review', value: 'NEEDS_REVIEW', count: stats.reviewCount },
    { label: 'Delivered', value: 'DELIVERED', count: stats.deliveredCount },
    { label: 'Cancelled', value: 'CANCELLED', count: allOrders.filter((o) => o.status === 'CANCELLED').length },
  ];

  const paymentMethods = [
    { label: 'All Payment Rails', value: '' },
    { label: 'Binance Pay', value: 'BINANCE' },
    { label: 'USDT (TRC20)', value: 'TRC20' },
    { label: 'USDT (BEP20)', value: 'BEP20' },
    { label: 'Telegram Stars', value: 'STARS' },
    { label: 'Bitcoin', value: 'BTC' },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Order Book</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Order Stream
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time ledger of orders and crypto settlements from the Telegram Bot and Mini App.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => book.refetch()}
            disabled={book.isFetching}
            className="flex items-center gap-2 px-3 py-2 text-xs"
          >
            <RefreshCw size={14} className={book.isFetching ? 'animate-spin' : ''} />
            Sync
          </Button>
          {allOrders.length > 0 && (
            <Button
              variant="outline"
              onClick={handleClearOrders}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
              title="Purge old demo test orders"
            >
              <Trash2 size={13} />
              Reset Book
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Settled Revenue</span>
            <DollarSign size={16} className="text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            ${stats.revenue.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Total fulfilled volume</div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Orders</span>
            <ShoppingBag size={16} className="text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.totalCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Lifetime transactions</div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Fulfilled</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.deliveredCount}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            {stats.totalCount > 0 ? `${Math.round((stats.deliveredCount / stats.totalCount) * 100)}% delivery rate` : 'Ready for orders'}
          </div>
        </div>

        <div className={`rounded-xl border p-4 shadow-sm transition ${
          stats.reviewCount > 0
            ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20'
            : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900'
        }`}>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Under Review</span>
            <AlertCircle size={16} className={stats.reviewCount > 0 ? 'text-blue-600' : 'text-slate-400'} />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.reviewCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats.reviewCount > 0 ? 'Manual TxID check needed' : 'All clear'}
          </div>
        </div>
      </div>

      {/* Control Bar: Tabs, Search & Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {statusTabs.map((t) => {
            const active = statusFilter === t.value;
            return (
              <button
                key={t.label}
                onClick={() => setStatusFilter(t.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <span>{t.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  active
                    ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Method Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ID, user, TxID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
            />
          </div>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
          >
            {paymentMethods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {book.isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : book.error ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40">
              <AlertCircle size={24} />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Live API Unreachable</h3>
            <p className="mt-1 text-xs text-slate-500">
              Unable to reach store orders API ({String(book.error)}). Ensure backend server is running.
            </p>
            <Button variant="outline" onClick={() => book.refetch()} className="mt-4 text-xs">
              Retry Connection
            </Button>
          </div>
        ) : rows.length === 0 ? (
          /* Professional Clean Empty State */
          <div className="py-16 px-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <ShoppingBag size={28} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              {search || statusFilter || methodFilter ? 'No Matching Orders Found' : 'No Live Orders Yet'}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {search || statusFilter || methodFilter
                ? 'Try clearing your search query or selecting a different status filter to view orders.'
                : 'Customer purchases initiated from Telegram Bot or Mini App storefront will stream here automatically in real time.'}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              {search || statusFilter || methodFilter ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    setMethodFilter('');
                  }}
                  className="text-xs"
                >
                  Clear All Filters
                </Button>
              ) : (
                <a
                  href={`${STORE_ORIGIN}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <ExternalLink size={13} />
                  Open Live Storefront
                </a>
              )}
            </div>
          </div>
        ) : (
          /* Professional Data Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-4">Settlement</th>
                  <th className="py-3 px-4">Payment Rail</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {rows.map((o) => {
                  const it = intents[o.id];
                  const st = getStatusConfig(o.status);
                  const payBadge = getPaymentBadge(it?.provider, it?.asset);
                  const StatusIcon = st.icon;

                  const orderSnippet = o.id.replace(/^ord_/, '');
                  const isUserDev = o.userTg === 'dev-user';
                  const displayUser = isUserDev
                    ? 'Guest Buyer'
                    : o.userTg.startsWith('@')
                    ? o.userTg
                    : /^\d+$/.test(o.userTg)
                    ? `TG #${o.userTg}`
                    : `@${o.userTg}`;

                  return (
                    <tr
                      key={o.id}
                      className="group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      {/* Order ID */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-sans">#</span>
                          <span title={o.id}>{orderSnippet.slice(0, 10)}</span>
                          <button
                            type="button"
                            onClick={() => copyText(o.id, `ord-${o.id}`)}
                            aria-label="Copy Order ID"
                            className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          >
                            {copiedKey === `ord-${o.id}` ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px] dark:bg-slate-800 dark:text-slate-300">
                            {displayUser.slice(1, 3).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {displayUser}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                              {o.userTg}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Product & Qty */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                          {pname[o.productId] ?? o.productId}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Qty: <span className="font-medium text-slate-700 dark:text-slate-300">×{o.qty}</span> · ${Number(o.unitPrice).toFixed(2)} / unit
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums text-sm">
                          ${Number(o.total).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                          USDT Equivalent
                        </div>
                      </td>

                      {/* Payment Rail */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${payBadge.className}`}>
                            <CreditCard size={10} />
                            {payBadge.name}
                          </span>
                          {it?.txHash ? (
                            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                              <span title={it.txHash}>
                                {it.txHash.slice(0, 6)}...{it.txHash.slice(-4)}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyText(it.txHash!, `tx-${o.id}`)}
                                aria-label="Copy TxID"
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                {copiedKey === `tx-${o.id}` ? (
                                  <Check size={11} className="text-emerald-500" />
                                ) : (
                                  <Copy size={11} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${st.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          <StatusIcon size={12} />
                          {st.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div>{new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-[10px] text-slate-400">{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          onClick={() => setDetail(o.id)}
                          className="px-3 py-1.5 text-xs hover:border-slate-400 dark:hover:border-slate-600"
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={sel ? `Order #${sel.id.replace(/^ord_/, '').slice(0, 12)}` : 'Order Details'}
      >
        {!sel ? (
          <Empty text="Order not found" />
        ) : (
          <div className="space-y-5 text-sm">
            {/* Top Status Banner */}
            {(() => {
              const st = getStatusConfig(sel.status);
              const StatusIcon = st.icon;
              return (
                <div className={`flex items-center justify-between rounded-xl border p-3.5 ${st.bg}`}>
                  <div className="flex items-center gap-2">
                    <StatusIcon size={18} />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">Status</div>
                      <div className="font-semibold">{st.label}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Order Total</div>
                    <div className="text-lg font-bold">${Number(sel.total).toFixed(2)}</div>
                  </div>
                </div>
              );
            })()}

            {/* Order Reference Card */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Order ID</span>
                <button
                  type="button"
                  onClick={() => copyText(sel.id, 'drawer-ord')}
                  className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400"
                >
                  {copiedKey === 'drawer-ord' ? <Check size={12} /> : <Copy size={12} />}
                  Copy Full ID
                </button>
              </div>
              <div className="break-all font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                {sel.id}
              </div>
            </div>

            {/* Customer & Product Information */}
            <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-3 dark:border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Purchase Summary
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="text-xs text-slate-500">Item</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {pname[sel.productId] ?? sel.productId}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="text-xs text-slate-500">Quantity</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">× {sel.qty}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="text-xs text-slate-500">Unit Price</span>
                <span className="text-slate-700 dark:text-slate-300 font-mono">
                  ${Number(sel.unitPrice).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Customer Handle</span>
                <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {sel.userTg}
                </span>
              </div>
            </div>

            {/* Payment & Settlement Info */}
            <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-3 dark:border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Payment Verification
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="text-xs text-slate-500">Payment Rail</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selIntent ? `${selIntent.provider} · ${selIntent.asset}` : 'Direct Intent'}
                </span>
              </div>

              {selIntent?.txHash && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Transaction Hash (TxID)</span>
                    <button
                      type="button"
                      onClick={() => copyText(selIntent.txHash!, 'drawer-tx')}
                      className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 text-xs"
                    >
                      {copiedKey === 'drawer-tx' ? <Check size={12} /> : <Copy size={12} />}
                      Copy TxID
                    </button>
                  </div>
                  <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {selIntent.txHash}
                  </div>
                </div>
              )}

              {selIntent?.address && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Payer Address / Binance UID</div>
                  <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {selIntent.address}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Created At</span>
                <span>{new Date(sel.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Delivered Credentials Vault */}
            {sel.deliveries && sel.deliveries.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    Delivered Account Credentials ({sel.deliveries.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const all = sel.deliveries!.map((d) => `${d.login} | ${d.password}`).join('\n');
                      copyText(all, 'drawer-creds');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {copiedKey === 'drawer-creds' ? 'Copied All' : 'Copy All'}
                  </button>
                </div>
                <div className="space-y-1.5 pt-1">
                  {sel.deliveries.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-white p-2.5 font-mono text-xs shadow-xs border border-emerald-100 dark:border-emerald-900/50 dark:bg-slate-900"
                    >
                      <div className="truncate mr-2">
                        <span className="text-slate-500 select-none">{i + 1}. </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{d.login}</span>
                        <span className="text-slate-400 select-none"> | </span>
                        <span className="text-slate-600 dark:text-slate-400">{d.password}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(`${d.login} | ${d.password}`, `cred-${i}`)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                      >
                        {copiedKey === `cred-${i}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Code */}
            {sel.code && (
              <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Activation / Redeem Code</div>
                <div className="flex items-center justify-between rounded-lg bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{sel.code}</span>
                  <button
                    type="button"
                    onClick={() => copyText(sel.code!, 'drawer-code')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {copiedKey === 'drawer-code' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="green"
                onClick={fulfill}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
              >
                <CheckCircle2 size={14} />
                {sel.status === 'DELIVERED' ? 'Redeliver Credentials' : 'Fulfill Order'}
              </Button>
              <Button
                variant="outline"
                onClick={refund}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 text-xs text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:text-rose-400 dark:hover:bg-rose-950/30"
              >
                <RefreshCw size={13} />
                Refund Order
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
