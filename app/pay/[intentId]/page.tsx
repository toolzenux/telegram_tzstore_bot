'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  Copy,
  Check,
  Clock,
  RefreshCw,
  Send,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Card, Toast, PrimaryButton } from '@/components/ui';
import { backButton, haptic, tzAuthHeader } from '@/lib/tma';

function BinanceLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.5L7.2 7.3l2.4 2.4L12 7.3l2.4 2.4 2.4-2.4L12 2.5zm-6.8 6.8L2.5 12l2.7 2.7 2.4-2.4-2.4-3zm13.6 0l-2.4 2.4 2.4 2.4 2.7-2.7-2.7-2.1zM12 11.3l-2.4 2.4L12 16.1l2.4-2.4-2.4-2.4zm-4.8 5.4l-2.4 2.4 4.8 4.8 2.4-2.4-2.4-2.4-2.4-2.4zm9.6 0l-2.4 2.4-2.4 2.4 2.4 2.4 4.8-4.8-2.4-2.4z"/>
    </svg>
  );
}

export default function Pay({ params }: { params: { intentId: string } }) {
  const router = useRouter();
  const qc = useQueryClient();
  const cachedIntent = qc.getQueryData<any>(['intent', params.intentId])?.intent;
  const [intent, setIntent] = useState<any>(cachedIntent ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [secs, setSecs] = useState(30 * 60);
  const [txid, setTxid] = useState(cachedIntent?.txHash ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const autoOpenedRef = useRef(false);

  useEffect(() => backButton(() => router.back()), [router]);

  function payWithStars() {
    const link = intent?.invoiceLink;
    if (!link) {
      showToast('Preparing Telegram invoice...');
      return;
    }
    haptic('medium');
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.openInvoice) {
      tg.openInvoice(link, (status: string) => {
        if (status === 'paid') {
          haptic('success');
          showToast('Stars payment confirmed! Fulfilling...');
        } else if (status === 'cancelled') {
          showToast('Payment cancelled');
        } else if (status === 'failed') {
          showToast('Payment failed');
        }
      });
    } else {
      window.open(link, '_blank');
    }
  }

  useEffect(() => {
    if (intent?.provider === 'STARS' && intent?.invoiceLink && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      payWithStars();
    }
  }, [intent?.provider, intent?.invoiceLink]);

  useEffect(() => {
    if (intent?.txHash && !txid) {
      setTxid(intent.txHash);
    }
  }, [intent?.txHash, txid]);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await fetch(`/api/payments/intent/${params.intentId}/status`, { headers: { ...tzAuthHeader() } });
        const j = await r.json();
        if (stop) return;
        if (j.intent) {
          setIntent(j.intent);
          qc.setQueryData(['intent', params.intentId], { intent: j.intent });
          if (j.intent.txHash && !txid) {
            setTxid(j.intent.txHash);
          }
        }
        if (j.intent?.status === 'FULFILLED' || j.intent?.status === 'CONFIRMED') {
          haptic('success');
          router.push(`/success/${j.intent.orderId}`);
          return;
        }
        if (j.intent?.status === 'CANCELLED' || j.intent?.status === 'EXPIRED') return;
      } catch {}
      setTimeout(poll, 3000);
    }
    poll();
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => { stop = true; clearInterval(t); };
  }, [params.intentId, router, qc, txid]);

  function copy(text: string, key: string, label = 'Copied') {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    showToast(`${label} copied to clipboard`);
    haptic('light');
    setTimeout(() => {
      setCopiedKey((cur) => (cur === key ? null : cur));
    }, 2000);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3000);
  }

  async function submitTxid() {
    const clean = txid.trim();
    if (clean.length < 6) {
      showToast('Enter your Binance Order ID / TxID (6+ digits)');
      haptic('warning');
      return;
    }
    setSubmitting(true);
    haptic('light');
    try {
      const r = await fetch(`/api/payments/intent/${params.intentId}/txid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...tzAuthHeader() },
        body: JSON.stringify({ txid: clean }),
      });
      const j = await r.json();
      if (!r.ok) {
        showToast(j.error ?? 'Submit failed');
        haptic('error');
        return;
      }
      if (j.message) showToast(j.message);
      if (j.state === 'matched') {
        haptic('success');
        router.push(`/success/${j.intent.orderId}`);
        return;
      }
      if (j.intent) setIntent(j.intent);
    } finally {
      setSubmitting(false);
    }
  }

  if (!intent) {
    return (
      <main className="pt-6">
        <Card className="p-8 text-center rounded-[22px]">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-slate-400" />
          <p className="mt-3 text-xs font-semibold text-slate-600">Retrieving settlement session…</p>
        </Card>
      </main>
    );
  }

  const isStars = intent.provider === 'STARS';
  const isBinance = intent.provider === 'BINANCE' || intent.asset === 'BINANCE-UID';
  const isBep20 = intent.provider === 'BEP20';
  const displayAsset = isStars ? 'XTR' : (isBinance || isBep20 || intent.asset === 'BINANCE-UID') ? 'USDT' : intent.asset;
  const paymentTitle = isStars 
    ? 'Telegram Stars' 
    : isBinance 
    ? 'Binance Pay Transfer' 
    : isBep20
    ? 'Deposit USDT to Binance'
    : `${displayAsset} Payment`;

  const rawUid = process.env.NEXT_PUBLIC_BINANCE_UID || '1134278389';
  const storeUid = (rawUid && !rawUid.includes('*') && rawUid.length >= 6) ? rawUid : '1134278389';
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <main className="pt-1.5 space-y-3.5 pb-8">
      {/* =========================================================================
          CARD 1: PAYMENT SETTLEMENT DETAILS (TOP CARD)
          ========================================================================= */}
      <Card className="p-5 rounded-[22px] border-slate-200/90 shadow-sm bg-white">
        {/* Header Rail Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isStars ? (
              <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                <span className="text-base">⭐</span>
              </div>
            ) : (isBinance || isBep20) ? (
              <div className="w-8 h-8 rounded-xl bg-[#F0B90B] flex items-center justify-center text-slate-950 shrink-0 shadow-xs">
                <BinanceLogo className="w-4.5 h-4.5" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                <CreditCard size={16} />
              </div>
            )}
            <div>
              <h1 className="text-[15px] font-bold text-slate-900 tracking-tight leading-snug">{paymentTitle}</h1>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                {isStars ? 'Telegram Official Settlement' : isBinance ? 'Direct Binance UID Rail' : isBep20 ? 'BNB Smart Chain (BEP20)' : 'Direct Settlement Rail'}
              </p>
            </div>
          </div>
          {isStars ? (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              ⚡ Instant Delivery
            </span>
          ) : isBinance ? (
            <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              0% Network Fee
            </span>
          ) : isBep20 ? (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
              BEP20 Network
            </span>
          ) : null}
        </div>

        {/* High-Contrast Amount Box */}
        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200/80 py-4 px-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {isStars ? 'TOTAL TELEGRAM STARS TO PAY' : 'EXACT AMOUNT TO SEND'}
          </p>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            {isStars ? (
              <>
                <span className="text-3xl font-extrabold text-amber-500 tracking-tight tabular-nums flex items-center gap-1.5">
                  <span className="text-2xl">⭐</span>
                  <span>{intent.amount}</span>
                </span>
                <span className="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-extrabold text-amber-900">
                  XTR
                </span>
              </>
            ) : (
              <>
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                  ${Number(intent.amount).toFixed(2)}
                </span>
                <span className="rounded-md bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                  {displayAsset}
                </span>
              </>
            )}
          </div>
          {isStars && (
            <p className="mt-1.5 text-xs text-slate-500 font-medium">
              ≈ ${(Number(intent.amount) / 70).toFixed(2)} USDT equivalent (70 Stars = $1 USDT)
            </p>
          )}
        </div>

        {/* Telegram Stars In-App Pay Action */}
        {isStars && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={payWithStars}
              style={{ minHeight: '48px', backgroundColor: '#F59E0B', color: '#FFFFFF' }}
              className="flex items-center justify-center gap-2 w-full rounded-xl hover:bg-amber-600 active:scale-[0.98] px-4 py-3 text-sm font-bold shadow-sm transition cursor-pointer"
            >
              <span className="text-base">⭐</span>
              <span>Pay {intent.amount} Stars with Telegram</span>
            </button>
            <p className="text-center text-[11px] text-slate-400 leading-tight">
              Tap to open Telegram&apos;s native in-app Stars payment sheet
            </p>
          </div>
        )}

        {/* Binance UID Payment Block */}
        {isBinance && (
          <div className="mt-4 space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Send to Store Binance UID</span>
                <span className="text-[11px] font-normal text-slate-400">Internal Transfer</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5 shadow-xs">
                <code className="text-base font-extrabold font-mono text-slate-900 tracking-wider pl-1">
                  {storeUid}
                </code>
                <button
                  type="button"
                  onClick={() => copy(storeUid, 'uid', 'Store UID')}
                  style={{ backgroundColor: '#181A20', color: '#FFFFFF', minHeight: '34px' }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs hover:opacity-95 active:scale-95 transition"
                >
                  {copiedKey === 'uid' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedKey === 'uid' ? 'Copied' : 'Copy UID'}</span>
                </button>
              </div>
            </div>

            {intent.memo && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Payment Note / Memo</span>
                  <span className="text-[11px] font-normal text-slate-400">Include in transfer note</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2 shadow-xs">
                  <code className="text-xs font-medium font-mono text-slate-700 truncate max-w-[210px] pl-1.5">
                    {intent.memo}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(intent.memo, 'memo', 'Memo')}
                    style={{ minHeight: '32px' }}
                    className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 px-2.5 py-1 text-xs font-semibold text-slate-700 transition shadow-xs"
                  >
                    {copiedKey === 'memo' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    <span>{copiedKey === 'memo' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Open in Binance App Direct Action */}
            <div className="pt-1">
              <a
                href="bnc://app"
                onClick={() => haptic('light')}
                style={{ minHeight: '46px', backgroundColor: '#F0B90B', color: '#0F172A' }}
                className="flex items-center justify-center gap-2 w-full rounded-xl hover:bg-[#e0ac07] active:scale-[0.98] px-4 py-3 text-sm font-bold shadow-sm transition"
              >
                <ExternalLink size={16} />
                <span>Open in Binance App</span>
              </a>
              <p className="mt-1.5 text-center text-[11px] text-slate-400 leading-tight">
                Send internal transfer to UID <span className="font-bold text-slate-600">{storeUid}</span>
              </p>
            </div>
          </div>
        )}

        {/* BEP20 Deposit Box matching Binance App */}
        {isBep20 && intent.address && (
          <div className="mt-4 space-y-3.5">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Network</span>
                <span className="rounded-md bg-amber-100/80 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  BNB Smart Chain
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900">BNB Smart Chain (BEP20)</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Wallet Address</span>
                <span className="text-[11px] font-normal text-slate-400">BEP20 Only</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5 shadow-xs">
                <code className="text-xs font-extrabold font-mono text-slate-900 break-all pl-1">
                  {intent.address}
                </code>
                <button
                  type="button"
                  onClick={() => copy(intent.address, 'addr', 'Wallet Address')}
                  style={{ backgroundColor: '#181A20', color: '#FFFFFF', minHeight: '34px' }}
                  className="ml-2 shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs hover:opacity-95 active:scale-95 transition"
                >
                  {copiedKey === 'addr' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedKey === 'addr' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="p-2 bg-white rounded-xl">
                <QRCodeSVG value={intent.address} size={160} />
              </div>
              <p className="mt-2.5 text-[11px] font-medium text-slate-500 text-center">
                Don&apos;t send NFTs to this address.
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#F0B90B] uppercase">
                <BinanceLogo className="w-3.5 h-3.5" />
                <span>BINANCE</span>
              </div>
            </div>
          </div>
        )}

        {/* Other Non-Binance On-Chain Deposit Fallback */}
        {!isBinance && !isBep20 && !isStars && intent.address && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Deposit Address ({intent.asset})</p>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <code className="text-xs font-mono text-slate-900 break-all pl-1">{intent.address}</code>
                <button
                  type="button"
                  onClick={() => copy(intent.address, 'addr', 'Address')}
                  style={{ backgroundColor: '#181A20', color: '#FFFFFF', minHeight: '32px' }}
                  className="ml-2 shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="mt-3 flex justify-center bg-white p-3 rounded-2xl border border-slate-100">
              <QRCodeSVG value={`${intent.address}?amount=${intent.amount}&memo=${intent.memo ?? ''}`} size={160} />
            </div>
          </div>
        )}

        {/* Session Expiration & Auto-Scan Footer */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            <span>Expires in {mm}:{ss}</span>
          </div>
          <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Auto-scanning
          </span>
        </div>
      </Card>

      {/* =========================================================================
          CARD 2: SUBMIT & UPDATE TXID VERIFICATION OR STARS CONFIRMATION
          ========================================================================= */}
      {!isStars ? (
        <Card className="p-5 rounded-[22px] border-slate-200/90 shadow-sm bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
              <Send size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-slate-900">
                Update Binance TxID
              </h2>
              <p className="text-[11px] text-slate-400">Step 2: Submit order proof to receive credentials</p>
            </div>
          </div>

          <div className="mt-3.5 space-y-3">
            <div>
              <label htmlFor="txid-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Binance Order ID or Transaction Hash
              </label>
              <input
                id="txid-input"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                placeholder="e.g. 9987567589786789"
                style={{ minHeight: '44px' }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white focus:bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition shadow-xs"
              />
            </div>

            <button
              type="button"
              onClick={submitTxid}
              disabled={submitting}
              style={{ backgroundColor: '#181A20', color: '#FFFFFF', minHeight: '44px' }}
              className="w-full rounded-xl font-bold text-xs shadow-sm hover:opacity-95 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-slate-300" />
                  <span>Verifying on Binance…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />
                  <span>Verify & Unlock Credentials</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (intent.txHash) {
                  setTxid(intent.txHash);
                } else {
                  setTxid('');
                }
                showToast('Input reset');
              }}
              style={{ minHeight: '40px' }}
              className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-600 transition flex items-center justify-center"
            >
              Cancel
            </button>
          </div>
        </Card>
      ) : (
        <Card className="p-5 rounded-[22px] border-slate-200/90 shadow-sm bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-slate-900">Instant Automated Settlement</h2>
              <p className="text-[11px] text-slate-400">Step 2: No manual TxID submission needed</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-amber-50/60 border border-amber-200/60 p-3.5 text-xs text-slate-700 leading-relaxed space-y-1.5">
            <p className="font-bold text-amber-900 flex items-center gap-1.5">
              <span>⚡</span> <span>1-Click In-App Payment</span>
            </p>
            <p className="text-slate-600">
              Telegram automatically confirms your payment the moment you tap <b>Pay Stars</b>. Your purchased digital account or license credentials will be unlocked instantly right here and also sent to your Telegram private chat.
            </p>
          </div>
        </Card>
      )}

      {/* Cancelled or Expired State */}
      {(intent.status === 'CANCELLED' || intent.status === 'EXPIRED') && (
        <Card className="p-5 rounded-[22px] text-center bg-white">
          <AlertCircle size={28} className="mx-auto text-red-500" />
          <h2 className="mt-2 text-[15px] font-bold text-slate-900">Deposit Cancelled or Expired</h2>
          <p className="mt-1 text-xs text-slate-500">This deposit session is no longer active.</p>
          <div className="mt-3">
            <PrimaryButton onClick={() => router.push('/home')}>Return to Store</PrimaryButton>
          </div>
        </Card>
      )}

      {/* Back to Order Action */}
      <button
        type="button"
        onClick={() => { haptic('light'); router.back(); }}
        style={{ minHeight: '44px' }}
        className="w-full flex items-center justify-center gap-1.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 shadow-xs transition active:scale-95"
      >
        <ArrowLeft size={14} />
        <span>Back to Order</span>
      </button>

      <Toast msg={toast} />
    </main>
  );
}
