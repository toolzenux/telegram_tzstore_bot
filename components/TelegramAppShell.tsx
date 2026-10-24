'use client';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Home, ShoppingBag, Package, Headphones, ChevronLeft, MoreVertical, X, CheckCircle2 } from 'lucide-react';
import { haptic } from '@/lib/tma';

export function TelegramAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isInsideTelegram, setIsInsideTelegram] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; username?: string; photo?: string } | null>(null);
  const [storeName, setStoreName] = useState('TZ Store');
  const [storeLogo, setStoreLogo] = useState('');
  const [supportUrl, setSupportUrl] = useState('https://t.me/TzStore_Support');

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d?.storeName) setStoreName(d.storeName);
        if (d?.storeLogo) setStoreLogo(d.storeLogo);
        if (d?.supportUrl) setSupportUrl(d.supportUrl);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
        tg.enableClosingConfirmation?.();
        tg.setHeaderColor?.('#2481CC');
        tg.setBackgroundColor?.('#E8F3E8');

        if (tg.initData && tg.initData.length > 0) {
          setIsInsideTelegram(true);
          try {
            if (typeof window !== 'undefined' && (!localStorage.getItem('tz_jwt') || localStorage.getItem('tz_jwt') === 'dev')) {
              fetch('/api/auth/telegram', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData }),
              })
                .then((r) => r.json())
                .then((j) => {
                  if (j?.token && j.token !== 'dev') localStorage.setItem('tz_jwt', j.token);
                })
                .catch(() => {});
            }
          } catch {}
        }

        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser) {
          setUser({
            name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || 'TZ User',
            username: tgUser.username ? `@${tgUser.username}` : undefined,
            photo: tgUser.photo_url,
          });
        }

        // Native Telegram Back Button integration
        const isRoot = pathname === '/' || pathname === '/home';
        if (!isRoot && tg.BackButton) {
          tg.BackButton.show();
          const onBack = () => router.back();
          tg.BackButton.onClick(onBack);
          return () => {
            try {
              tg.BackButton.offClick(onBack);
              tg.BackButton.hide();
            } catch {}
          };
        } else if (tg.BackButton) {
          tg.BackButton.hide();
        }
      }
    } catch {}
  }, [pathname, router]);

  const isCheckoutOrPay = pathname?.startsWith('/checkout') || pathname?.startsWith('/pay') || pathname?.startsWith('/success');
  const isRoot = pathname === '/' || pathname === '/home';

  const navItems = [
    { label: 'Home', icon: Home, href: '/home', active: pathname === '/home' || pathname === '/' },
    { label: 'Products', icon: ShoppingBag, href: '/home?view=products', active: pathname?.startsWith('/c/') || pathname?.startsWith('/p/') },
    { label: 'My Orders', icon: Package, href: '/orders', active: pathname === '/orders' },
    { label: 'Support', icon: Headphones, href: supportUrl, isExternal: true, active: false },
  ];

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
        onLoad={() => {
          try {
            const tg = (window as any)?.Telegram?.WebApp;
            tg?.ready?.();
            tg?.expand?.();
          } catch {}
        }}
      />

      <div className="min-h-screen w-full flex items-center justify-center sm:p-4 bg-[#0e1621] sm:bg-[#17212b]/95">
        {/* Telegram Mobile App Frame (Desktop Simulation + Responsive Mobile) */}
        <div className="w-full sm:max-w-[430px] min-h-[100dvh] sm:min-h-[860px] sm:max-h-[92vh] sm:rounded-[36px] bg-[#E8F3E8] shadow-2xl flex flex-col overflow-hidden relative sm:ring-1 sm:ring-white/10">
          
          {/* Telegram Header Bar */}
          <header className="sticky top-0 z-50 flex items-center justify-between px-3.5 py-2.5 bg-[#2481CC] text-white select-none shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              {!isRoot ? (
                <button
                  onClick={() => { haptic('light'); router.back(); }}
                  className="p-1 -ml-1 rounded-full hover:bg-white/15 active:scale-95 transition"
                  aria-label="Back"
                >
                  <ChevronLeft size={22} />
                </button>
              ) : storeLogo ? (
                <div className="w-8 h-8 rounded-full bg-white/20 p-0.5 flex items-center justify-center shadow-inner shrink-0 overflow-hidden">
                  <img
                    src={storeLogo}
                    alt={storeName}
                    className="w-full h-full object-contain rounded-full"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shadow-inner shrink-0 text-white">
                  <ShoppingBag size={16} />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1 leading-tight">
                  <span className="font-bold text-[15px] truncate">{storeName}</span>
                  <CheckCircle2 size={13} className="text-[#64D2FF] fill-[#2481CC] shrink-0" />
                </div>
                <div className="text-[11px] text-white/80 leading-none">
                  {user?.username ? user.username : 'bot'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition"
                aria-label="More options"
              >
                <MoreVertical size={19} />
              </button>
              <button
                onClick={() => {
                  try { (window as any)?.Telegram?.WebApp?.close?.(); } catch {}
                }}
                className="p-1.5 rounded-full hover:bg-white/15 active:scale-95 transition text-white/90"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
          </header>

          {/* Quick Dropdown Menu */}
          {menuOpen && (
            <div className="absolute top-12 right-3 z-50 w-48 rounded-xl bg-white shadow-xl border border-gray-100 py-1.5 text-sm animate-in fade-in duration-100">
              <Link
                href="/home"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-gray-50 text-gray-800"
              >
                <Home size={15} className="text-[#2481CC]" /> Store Home
              </Link>
              <Link
                href="/orders"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-gray-50 text-gray-800"
              >
                <Package size={15} className="text-[#2481CC]" /> My Orders
              </Link>
              <a
                href={supportUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-gray-50 text-gray-800"
              >
                <Headphones size={15} className="text-[#2481CC]" /> Support Chat
              </a>
              <div className="my-1 border-t border-gray-100" />
              <div className="px-3.5 py-1 text-[11px] text-gray-400">
                {storeName} • TMA Mobile
              </div>
            </div>
          )}

          {/* App Scrollable Content */}
          <main className="flex-1 overflow-y-auto px-3.5 pb-24 pt-2">
            {children}
          </main>

          {/* Native Telegram Mobile Bottom Navigation Bar */}
          {!isCheckoutOrPay && (
            <nav className="fixed sm:absolute bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/80 px-2 py-1.5 flex items-center justify-around select-none">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isSelected = item.active;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    target={item.isExternal ? '_blank' : undefined}
                    rel={item.isExternal ? 'noreferrer' : undefined}
                    onClick={() => haptic('light')}
                    className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition tg-press ${
                      isSelected ? 'text-[#2481CC]' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <Icon size={21} strokeWidth={isSelected ? 2.4 : 1.8} />
                    <span className={`text-[11px] mt-0.5 font-medium ${isSelected ? 'font-bold' : ''}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

        </div>
      </div>
    </>
  );
}
