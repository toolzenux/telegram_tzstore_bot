import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Package, FolderOpen, ReceiptText, CreditCard, Users,
  Gift, Megaphone, Settings as SettingsIcon, ShieldCheck, Menu, X,
  Sun, Moon, LogOut, Store, ChevronLeft, MoreHorizontal, Sparkles, Smartphone,
} from 'lucide-react';
import { useStore } from './store';
import { ToastHost } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/products', label: 'Category Product', Icon: Package },
  { to: '/categories', label: 'Categories', Icon: FolderOpen },
  { to: '/orders', label: 'Orders', Icon: ReceiptText },
  { to: '/payments', label: 'Payments', Icon: CreditCard },
  { to: '/users', label: 'Users', Icon: Users },
  { to: '/referrals', label: 'Referrals', Icon: Gift },
  { to: '/broadcast', label: 'Broadcast', Icon: Megaphone },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/admins', label: 'Admins & Audit', Icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
] as const;

// Quick primary tabs for Mobile Bottom Bar
const MOBILE_BOTTOM_TABS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/products', label: 'Products', Icon: Package },
  { to: '/orders', label: 'Orders', Icon: ReceiptText },
  { to: '/payments', label: 'Payments', Icon: CreditCard },
] as const;

function triggerHaptic() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  } catch {}
}

function Logo({ compact = false, storeName = 'TZ Store', storeLogo = '' }: { compact?: boolean; storeName?: string; storeLogo?: string }) {
  const initials = storeName ? storeName.slice(0, 2).toUpperCase() : 'TZ';
  return (
    <Link to="/" className="mb-6 flex items-center gap-2.5">
      {storeLogo ? (
        <img
          src={storeLogo}
          alt={storeName}
          className="h-9 w-9 rounded-xl object-contain bg-white dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 shadow-sm shrink-0"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-black tracking-tight text-white shadow-sm shrink-0">
          {initials}
        </span>
      )}
      {!compact && (
        <span className="leading-tight min-w-0">
          <span className="block text-[15px] font-extrabold tracking-tight truncate">{storeName || 'TZ Store'}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Admin</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ onNav }: { onNav?: () => void }) {
  const { admin } = useStore();
  const visible = NAV.filter((n) => !('roles' in n && (n as unknown as { roles: string[] }).roles) || (admin && ((n as unknown as { roles: string[] }).roles.includes(admin.role))));
  return (
    <nav className="space-y-1">
      {visible.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={() => {
            triggerHaptic();
            onNav?.();
          }}
          className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
        >
          <n.Icon size={17} strokeWidth={2.2} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { admin, theme, toggleTheme, sidebar, toggleSidebar } = useStore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  // Telegram Mini App lifecycle hook
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      setIsTelegramMiniApp(true);
      tg.ready?.();
      tg.expand?.();
      tg.enableClosingConfirmation?.();
      try {
        if (theme === 'dark') {
          tg.setHeaderColor?.('#0f172a');
          tg.setBackgroundColor?.('#020617');
        } else {
          tg.setHeaderColor?.('#ffffff');
          tg.setBackgroundColor?.('#f8fafc');
        }
      } catch {}
    }
  }, [theme]);

  const [storeName, setStoreName] = useState('TZ Store');
  const [storeLogo, setStoreLogo] = useState('');

  const refreshBranding = () => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d?.storeName) {
          setStoreName(d.storeName);
          document.title = `${d.storeName} Admin`;
        }
        if (typeof d?.storeLogo === 'string') {
          setStoreLogo(d.storeLogo);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshBranding();
    const handleBrandingChange = (e: Event) => {
      const custom = e as CustomEvent<{ storeName?: string; storeLogo?: string }>;
      if (custom.detail?.storeName) {
        setStoreName(custom.detail.storeName);
        document.title = `${custom.detail.storeName} Admin`;
      }
      if (custom.detail?.storeLogo !== undefined) {
        setStoreLogo(custom.detail.storeLogo);
      }
      if (!custom.detail?.storeName && custom.detail?.storeLogo === undefined) {
        refreshBranding();
      }
    };
    window.addEventListener('tz:storeNameChanged', handleBrandingChange);
    return () => window.removeEventListener('tz:storeNameChanged', handleBrandingChange);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const storeUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_STORE_URL ?? 'http://localhost:3000/home';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      {sidebar && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-none dark:ring-1 dark:ring-slate-800 md:block">
          <Logo storeName={storeName} storeLogo={storeLogo} />
          <NavList />
          <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
              <Sparkles size={14} className="text-blue-500" /> Live Store Admin
            </div>
            <div className="mt-0.5">Connected to Supabase PostgreSQL database.</div>
          </div>
          <div className="mt-3">
            <Link
              to="/mobile"
              className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300"
            >
              <Smartphone size={16} />
              <span>Telegram Bot App UI</span>
            </Link>
          </div>
        </aside>
      )}

      {/* Mobile "More" Drawer Modal */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-[85%] max-w-xs overflow-y-auto bg-white p-5 shadow-2xl transition-transform dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                {storeLogo ? (
                  <img
                    src={storeLogo}
                    alt={storeName}
                    className="h-9 w-9 rounded-xl object-contain bg-white dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 shadow-sm shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white shadow-sm shrink-0">
                    {storeName ? storeName.slice(0, 2).toUpperCase() : 'TZ'}
                  </span>
                )}
                <div>
                  <div className="text-sm font-extrabold tracking-tight truncate max-w-[170px]">{storeName || 'TZ Store'} Admin</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mobile Portal</div>
                </div>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            {/* Admin User Card */}
            <div className="mb-4 rounded-xl bg-blue-50/70 p-3.5 dark:bg-blue-950/40 dark:border dark:border-blue-900/50">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {admin?.email?.[0]?.toUpperCase() || 'A'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{admin?.email}</div>
                  <span className="inline-block rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                    {admin?.role || 'ADMIN'}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation in Drawer */}
            <div className="mb-6 space-y-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">All Modules</div>
              <NavList onNav={() => setMobileDrawerOpen(false)} />
            </div>

            {/* Quick Actions in Drawer */}
            <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Link
                to="/mobile"
                onClick={() => {
                  triggerHaptic();
                  setMobileDrawerOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-300"
              >
                <Smartphone size={16} /> Telegram Bot Mobile UI
              </Link>
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-2.5 rounded-xl bg-slate-100 px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
              >
                <Store size={16} /> Open Customer Storefront
              </a>
              <button
                onClick={() => {
                  triggerHaptic();
                  localStorage.removeItem('tz_access');
                  localStorage.removeItem('tz_refresh');
                  nav('/login');
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400"
              >
                <LogOut size={16} /> Sign Out of Admin
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex min-h-screen flex-1 flex-col ${sidebar ? 'md:pl-60' : ''}`}>
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-4 sm:py-3">
          {/* Desktop Sidebar Toggle */}
          <button
            onClick={() => {
              if (window.matchMedia('(max-width: 767px)').matches) {
                setMobileDrawerOpen(true);
              } else {
                toggleSidebar();
              }
            }}
            aria-label="Toggle menu"
            className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex"
          >
            {sidebar ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>

          {/* Mobile Top Brand Bar */}
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-xs font-black text-white shadow-sm">
              TZ
            </span>
            <div className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight">{storeName || 'TZ Store'}</span>
              <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Admin Mobile</span>
            </div>
            {isTelegramMiniApp && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                ✈️ TG Bot
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Action Icons */}
          <Link
            to="/mobile"
            title="Switch to Telegram Bot Mobile App UI"
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60"
          >
            <Smartphone size={15} /> <span className="hidden sm:inline">📱 Telegram Bot App UI</span>
          </Link>

          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            title="Open user storefront"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm"
          >
            <Store size={16} /> <span className="hidden sm:inline">Store</span>
          </a>

          <button
            onClick={() => {
              triggerHaptic();
              toggleTheme();
            }}
            title="Theme"
            aria-label="Toggle theme"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          {/* Desktop User Info & Sign Out */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {admin?.email?.[0]?.toUpperCase() || 'A'}
            </span>
            <div className="hidden text-xs leading-tight lg:block">
              <div className="max-w-[130px] truncate font-semibold">{admin?.email}</div>
              <div className="text-[10px] uppercase text-slate-400">{admin?.role}</div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('tz_access');
                localStorage.removeItem('tz_refresh');
                nav('/login');
              }}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Mobile Drawer Open Button in Header */}
          <button
            onClick={() => {
              triggerHaptic();
              setMobileDrawerOpen(true);
            }}
            aria-label="Open mobile menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
          >
            <Menu size={20} />
          </button>
        </header>

        {/* Page Content with Safe Area Bottom Padding on Mobile */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-3 pb-24 sm:p-5 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Telegram Mini App / Mobile Bottom Navigation Bar (md:hidden) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200/90 bg-white/95 px-2 py-1.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-900/95 dark:shadow-[0_-4px_16px_rgba(0,0,0,0.4)] md:hidden"
        style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {MOBILE_BOTTOM_TABS.map((tab) => {
          const isActive = location.pathname === tab.to;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={triggerHaptic}
              className={`flex flex-1 flex-col items-center justify-center rounded-xl py-1 text-center transition-all ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <div className={`relative flex items-center justify-center rounded-full p-1 ${isActive ? 'bg-blue-100/70 dark:bg-blue-950/80' : ''}`}>
                <tab.Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`mt-0.5 text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </NavLink>
          );
        })}

        {/* 5th Tab: "More" to open drawer */}
        <button
          onClick={() => {
            triggerHaptic();
            setMobileDrawerOpen(true);
          }}
          className={`flex flex-1 flex-col items-center justify-center rounded-xl py-1 text-center transition-all ${
            mobileDrawerOpen
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <div className={`relative flex items-center justify-center rounded-full p-1 ${mobileDrawerOpen ? 'bg-blue-100/70 dark:bg-blue-950/80' : ''}`}>
            <MoreHorizontal size={19} strokeWidth={mobileDrawerOpen ? 2.5 : 2} />
          </div>
          <span className={`mt-0.5 text-[10px] leading-none ${mobileDrawerOpen ? 'font-bold' : 'font-medium'}`}>
            More
          </span>
        </button>
      </nav>

      <ToastHost />
    </div>
  );
}
