'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { haptic } from '@/lib/tma';
import { Info, Headphones, Send, ShieldCheck, Zap } from 'lucide-react';

export default function About() {
  const [storeName, setStoreName] = useState('TZ Store');
  const [supportUrl, setSupportUrl] = useState('https://t.me/TzStore_Support');
  const [channelUrl, setChannelUrl] = useState('https://t.me/TZStoreChannel');

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d?.storeName) setStoreName(d.storeName);
        if (d?.supportUrl) setSupportUrl(d.supportUrl);
        if (d?.channelUrl) setChannelUrl(d.channelUrl);
      })
      .catch(() => {});
  }, []);

  const supportHandle = supportUrl.includes('t.me/') ? `@${supportUrl.split('t.me/')[1]}` : supportUrl;
  const channelHandle = channelUrl.includes('t.me/') ? `@${channelUrl.split('t.me/')[1]}` : channelUrl;

  return (
    <main className="space-y-3 pt-2 pb-6">
      <div className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)] border border-black/[0.04] space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#2481CC]/10 text-[#2481CC] flex items-center justify-center text-xl shrink-0">
            <Info size={22} />
          </div>
          <div>
            <h1 className="text-[17px] font-extrabold text-gray-900 leading-tight">About {storeName}</h1>
            <p className="text-xs text-gray-500">Autonomous Instant Digital Delivery</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">
          Instant digital goods — developer accounts, AI tools, memberships, and cloud software. 
          Fully automated delivery vault with zero wait time.
        </p>

        <div className="space-y-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2.5 text-xs text-gray-700">
            <Zap size={15} className="text-emerald-500 shrink-0" />
            <span><b>Instant Delivery:</b> Credentials decrypted immediately after payment.</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-gray-700">
            <ShieldCheck size={15} className="text-[#2481CC] shrink-0" />
            <span><b>Guaranteed Stock:</b> Real-time inventory managed by cryptographic vault.</span>
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-gray-100 text-xs">
          <a
            href={supportUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptic('light')}
            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-800 transition"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Headphones size={15} className="text-[#2481CC]" /> Live Support
            </span>
            <span className="text-gray-400">{supportHandle} ↗</span>
          </a>

          <a
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => haptic('light')}
            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-800 transition"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Send size={15} className="text-[#0088cc]" /> Announcements Channel
            </span>
            <span className="text-gray-400">{channelHandle} ↗</span>
          </a>
        </div>
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
