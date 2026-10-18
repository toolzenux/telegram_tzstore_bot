'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Toast } from '@/components/ui';
import { haptic, tzAuthHeader } from '@/lib/tma';
import { Gift, Copy, Check, Users, Sparkles, ArrowLeft, Share2 } from 'lucide-react';

export default function Referrals() {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userTgId, setUserTgId] = useState<string | number>('1134278389');

  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    try {
      const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
      if (tg?.id) {
        setUserTgId(tg.id);
        fetch('/api/users/me', { headers: { ...tzAuthHeader() } })
          .then((r) => r.json())
          .then((j) => {
            if (typeof j?.referralEarnings === 'number') setEarnings(j.referralEarnings);
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  const refLink = `https://t.me/TZStoreBot?start=ref_${userTgId}`;

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(refLink);
      setCopied(true);
      haptic('success');
      setToast('Referral link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShare = () => {
    haptic('medium');
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('🛍️ Get instant digital goods, AI tools and VPNs on TZ Store with automated instant delivery!')}`;
      window.open(shareUrl, '_blank');
    } catch {}
  };

  return (
    <main className="space-y-3 pt-2 pb-6">
      <div className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)] border border-black/[0.04] space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-xl shrink-0">
            <Gift size={22} />
          </div>
          <div>
            <h1 className="text-[17px] font-extrabold text-gray-900 leading-tight">Referral Program</h1>
            <p className="text-xs text-gray-500">Earn 10% commission on every order</p>
          </div>
        </div>

        {/* Earnings Card */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/70 p-4 border border-amber-200/60">
          <div className="text-xs font-semibold text-amber-800">Total Referral Earnings</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-gray-900">${earnings.toFixed(2)}</span>
            <span className="text-xs font-bold text-amber-700">USDT</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-800/80">
            Commissions are credited directly to your wallet upon confirmed buyer delivery.
          </p>
        </div>

        {/* Referral Link Box */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 block">Your Personal Invite Link</label>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
            <span className="text-xs font-mono text-gray-600 truncate flex-1 px-1">
              {refLink}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-[#2481CC] text-white text-xs font-bold flex items-center gap-1 active:scale-95 transition touch-manipulation"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-white text-sm font-bold shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition touch-manipulation"
        >
          <Share2 size={16} /> Share Link with Friends
        </button>
      </div>

      <Link 
        href="/home" 
        onClick={() => haptic('light')}
        className="block rounded-[16px] bg-white border border-gray-200 py-3 text-center text-[14px] font-bold text-gray-700 shadow-sm tg-press active:scale-[0.98] transition touch-manipulation"
      >
        ← Back to Store
      </Link>

      <Toast msg={toast} />
    </main>
  );
}
