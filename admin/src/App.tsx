import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import Layout from './layout';
import { useStore } from './store';
import { get, post } from './api';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const Categories = lazy(() => import('./pages/Categories'));
const Orders = lazy(() => import('./pages/Orders'));
const Payments = lazy(() => import('./pages/Payments'));
const Users = lazy(() => import('./pages/Users'));
const Referrals = lazy(() => import('./pages/Referrals'));
const Broadcast = lazy(() => import('./pages/Broadcast'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminsAudit = lazy(() => import('./pages/AdminsAudit'));
const MobileAdminApp = lazy(() => import('./pages/MobileAdminApp'));

const qc = new QueryClient();

function Guard({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const admin = useStore((s) => s.admin);
  const setAdmin = useStore((s) => s.setAdmin);
  const [loading, setLoading] = useState(!admin);
  useEffect(() => {
    if (admin) return;
    const tgInitData = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp?.initData : null;
    if (!localStorage.getItem('tz_access') && tgInitData) {
      post('/api/admin/auth/telegram', { initData: tgInitData })
        .then((res: any) => {
          if (res?.accessToken) {
            localStorage.setItem('tz_access', res.accessToken);
            if (res.refreshToken) localStorage.setItem('tz_refresh', res.refreshToken);
            setAdmin(res.admin);
          }
        })
        .catch(() => null)
        .finally(() => setLoading(false));
      return;
    }
    if (!localStorage.getItem('tz_access')) { setLoading(false); return; }
    get('/api/auth/me')
      .then((me) => setAdmin(me as never))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [admin, setAdmin]);
  if (loading) return <div className="p-8 text-sm">Loading…</div>;
  if (!useStore.getState().admin) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(useStore.getState().admin!.role)) {
    return <div className="p-8"><h1 className="text-2xl font-extrabold">403</h1><p className="text-sm">Forbidden for role {useStore.getState().admin!.role}.</p></div>;
  }
  return children;
}

export default function App() {
  const basename = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? '/admin' : '';
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={basename}>
        <Suspense fallback={<div className="p-8 text-sm">Loading…</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Dedicated Telegram Admin Mobile App */}
            <Route path="/mobile" element={<Guard><MobileAdminApp /></Guard>} />
            {/* Desktop Web Admin Dashboard */}
            <Route element={<Guard><Layout /></Guard>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/users" element={<Users />} />
              <Route path="/referrals" element={<Referrals />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/settings" element={<Guard roles={['SUPER_ADMIN', 'MANAGER']}><Settings /></Guard>} />
              <Route path="/admins" element={<AdminsAudit />} />
            </Route>
            <Route path="*" element={<div className="p-8"><h1 className="text-2xl font-extrabold">404</h1><p className="text-sm">Page not found. <a href="/" className="underline">Dashboard</a></p></div>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
