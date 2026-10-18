'use client';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { haptic } from '@/lib/tma';
import { CreditCard, ArrowLeft, ChevronRight, Zap } from 'lucide-react';

const METHODS = [
  { id: 'BINANCE', emoji: '🟡', name: 'Binance UID Transfer', desc: 'Zero fee internal transfer. UID: 1134278389', badge: '0% Fee' },
  { id: 'BEP20', emoji: '🅣', name: 'USDT (BEP20 / BSC)', desc: 'BNB Smart Chain address: 0x620b...cf711', badge: 'Instant' },
];

export default function Deposit() {
  return (
    <main className="space-y-3 pt-2 pb-6">
      <div className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] border border-black/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#2481CC]/10 text-[#2481CC] flex items-center justify-center text-xl shrink-0">
            <CreditCard size={22} />
          </div>
          <div>
            <h1 className="text-[17px] font-extrabold text-gray-900 leading-tight">Deposit Funds</h1>
            <p className="text-xs text-gray-500">Auto-credited directly to your wallet balance</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {METHODS.map((m) => (
          <Link 
            key={m.id} 
            href="/orders" 
            onClick={() => haptic('light')}
            className="block rounded-[18px] bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] tg-press active:scale-[0.98] transition hover:shadow-md touch-manipulation"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl shrink-0">
                {m.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[14px] text-gray-900 truncate">{m.name}</span>
                  {m.badge && (
                    <span className="text-[10px] font-bold text-[#2481CC] bg-[#2481CC]/10 px-1.5 py-0.5 rounded-md">
                      {m.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{m.desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-400 shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      <Link 
        href="/home" 
        onClick={() => haptic('light')}
        className="block rounded-[16px] bg-white border border-gray-200 py-3 text-center text-[14px] font-bold text-gray-700 shadow-sm tg-press active:scale-[0.98] transition touch-manipulation"
      >
        ← Back to Store
      </Link>
    </main>
  );
}
