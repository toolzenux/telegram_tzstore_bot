'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Skeleton, Toast, PrimaryButton } from '@/components/ui';
import { haptic, mainButton, tzAuthHeader } from '@/lib/tma';
import { CheckCircle2, Copy, Eye, EyeOff, ShieldCheck, ShoppingBag, MessageCircle, ArrowLeft, Clock, Send, RefreshCw, ClipboardList, AlertCircle } from 'lucide-react';

export default function Success({ params }: { params: { orderId: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<number, boolean>>({});

  useEffect(() => mainButton('Back to Store', () => router.push('/home')), [router]);

  useEffect(() => {
    let stop = false;
    async function poll() {
      const r = await fetch(`/api/orders?id=${params.orderId}`, { headers: { ...tzAuthHeader() } });
      const j = await r.json();
      if (stop) return;
      setOrder(j.order);
      if (j.order?.status === 'DELIVERED') { haptic('success'); return; }
      if (j.order?.status === 'CANCELLED') return;
      setTimeout(poll, 3000);
    }
    poll();
    return () => { stop = true; };
  }, [params.orderId]);

  function copyText(text: string, label: string) {
    navigator.clipboard?.writeText(text);
    setToast(`${label} copied to clipboard`);
    haptic('success');
  }

  function copyAllAccounts(deliveries: Array<{ login: string; password: string }>) {
    const formatted = deliveries.map((d, i) => `Account #${i + 1}\nID: ${d.login}\nPW: ${d.password}`).join('\n\n');
    navigator.clipboard?.writeText(formatted);
    setToast('All accounts copied to clipboard');
    haptic('success');
  }

  if (!order) {
    return (
      <main className="pt-4 space-y-3">
        <Skeleton className="h-44 rounded-2xl" />
        <p className="mt-2 text-center text-xs text-slate-500 animate-pulse">Checking order & credentials…</p>
        <button
          onClick={() => router.back()}
          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </main>
    );
  }

  if (order.status === 'CANCELLED') {
    return (
      <main className="pt-4 space-y-3">
        <Card className="border-l-4 border-l-red-500 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500" />
            <p className="font-semibold text-red-600">Deposit Cancelled</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">Order {order.id} was cancelled or expired.</p>
          <div className="mt-4">
            <PrimaryButton onClick={() => router.push('/home')}>Return to Menu</PrimaryButton>
          </div>
        </Card>
        <button
          onClick={() => router.back()}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </main>
    );
  }

  if (order.status === 'NEEDS_REVIEW') {
    return (
      <main className="pt-4 space-y-3">
        <Card className="border-l-4 border-l-amber-400 bg-amber-50/40 p-5">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-amber-700" />
            <div className="font-bold text-amber-900">Payment Submitted for Review</div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">
            Order <b>{order.id}</b> is being verified. Your credentials will be delivered here and sent directly to your Telegram chat shortly.
          </p>
        </Card>
        <button
          onClick={() => router.push('/orders')}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition"
        >
          <ClipboardList size={15} />
          <span>My Orders</span>
        </button>
        <button
          onClick={() => router.back()}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </main>
    );
  }

  if (order.status !== 'DELIVERED') {
    return (
      <main className="pt-4 space-y-3">
        <Card className="p-5 text-center">
          <p className="text-sm font-bold text-slate-900">Processing Payment…</p>
          <p className="mt-1 text-xs text-slate-500">Order {order.id} • Status: <b>{order.status}</b></p>
          <div className="mt-4 flex justify-center">
            <RefreshCw size={24} className="animate-spin text-slate-400" />
          </div>
        </Card>
        <button
          onClick={() => router.back()}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </main>
    );
  }

  const deliveries: Array<{ login: string; password: string }> = order.deliveries ?? [];

  return (
    <main className="pt-3 pb-8 space-y-3">
      {/* 1. Header Celebratory Card */}
      <div className="rounded-2xl border border-green-200 bg-gradient-to-b from-green-50/80 to-white p-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Order Completed & Delivered!</h1>
            <p className="text-xs text-gray-500">
              Order ID: <code className="font-bold text-gray-800">{order.id}</code>
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-gray-50/90 p-2.5 text-xs text-gray-600">
          <div>
            <span className="text-gray-400">Product:</span>
            <div className="font-semibold text-gray-900 truncate">{order.productId}</div>
          </div>
          <div>
            <span className="text-gray-400">Quantity / Total:</span>
            <div className="font-semibold text-gray-900">{order.qty}x • ${Number(order.total).toFixed(2)}</div>
          </div>
        </div>

        {/* Telegram Direct Notification Badge */}
        <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-blue-50/70 p-2.5 text-[12px] text-blue-900">
          <Send size={14} className="text-blue-600 shrink-0" />
          <span><b>Sent to Telegram:</b> A copy of these credentials was also sent to your Telegram direct chat.</span>
        </div>
      </div>

      {/* 2. Credentials Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-[#57C25E]" />
            Delivered Account Credentials
          </h2>
          {deliveries.length > 1 && (
            <button
              onClick={() => copyAllAccounts(deliveries)}
              className="flex items-center gap-1 text-xs font-semibold text-[#4A90D9] hover:underline"
            >
              <Copy size={12} />
              <span>Copy All ({deliveries.length})</span>
            </button>
          )}
        </div>

        {deliveries.length > 0 ? (
          deliveries.map((d, i) => {
            const isPwVisible = !!showPassword[i];
            return (
              <div key={i} className="rounded-2xl border border-gray-200/90 bg-white p-3.5 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                    Account {deliveries.length > 1 ? `#${i + 1}` : ''}
                  </span>
                  <button
                    onClick={() => copyText(`${d.login} / ${d.password}`, `Account ${i + 1}`)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#4A90D9] hover:underline"
                  >
                    <Copy size={12} />
                    Copy ID:PW
                  </button>
                </div>

                {/* Account ID / Login / Email */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Account ID / Email
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200/60 p-2.5">
                    <code className="text-[13px] font-bold text-gray-900 break-all select-all">
                      {d.login}
                    </code>
                    <button
                      onClick={() => copyText(d.login, 'Account ID')}
                      className="ml-2 flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm border border-gray-200 active:bg-gray-100"
                    >
                      <Copy size={13} />
                      Copy
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Password / Access Key
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200/60 p-2.5">
                    <code className="text-[13px] font-bold text-gray-900 break-all select-all">
                      {isPwVisible ? d.password : '••••••••••••••••'}
                    </code>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => setShowPassword((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className="rounded-lg bg-white p-1 text-gray-600 shadow-sm border border-gray-200 active:bg-gray-100"
                        title={isPwVisible ? 'Hide password' : 'Show password'}
                      >
                        {isPwVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => copyText(d.password, 'Password')}
                        className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm border border-gray-200 active:bg-gray-100"
                      >
                        <Copy size={13} />
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm space-y-2">
            <div className="text-xs font-semibold text-gray-500">Delivery Key / Voucher Code:</div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 border border-gray-200">
              <code className="break-all font-mono text-sm font-bold text-gray-900">{order.code}</code>
              <button
                className="ml-2 flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm border border-gray-200"
                onClick={() => copyText(order.code ?? '', 'Code')}
              >
                <Copy size={13} />
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Action Buttons */}
      <div className="space-y-2 pt-2">
        <button
          onClick={() => router.push('/home')}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#57C25E] px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition active:scale-[0.98]"
        >
          <ShoppingBag size={18} />
          Continue Shopping
        </button>

        <button
          onClick={() => router.push('/orders')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 transition active:bg-slate-200"
        >
          <ClipboardList size={15} />
          <span>View All My Orders</span>
        </button>

        <a
          href="https://t.me/TzStore_Support"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-1.5 text-center text-xs font-medium text-[#4A90D9] py-1"
        >
          <MessageCircle size={14} />
          <span>Need assistance? Contact 24/7 Support (@TzStore_Support)</span>
        </a>

        <button
          onClick={() => router.back()}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 py-3 text-xs font-semibold text-slate-600 shadow-sm transition active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>
      </div>

      <Toast msg={toast} />
    </main>
  );
}
