import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api';
import { useStore } from '../store';
import { Button, Card, Input, Field } from '../ui';

const BASE = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ?? '';

export default function Login() {
  const [email, setEmail] = useState('toolzenux@gmail.com');
  const [password, setPassword] = useState('Toolzenux#@');
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const setAdmin = useStore((s) => s.setAdmin);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const j = (await post('/api/auth/login', { email, password })) as {
        accessToken: string; refreshToken: string; admin: { id: string; email: string; role: 'SUPER_ADMIN' | 'MANAGER' | 'SUPPORT' };
      };
      localStorage.setItem('tz_access', j.accessToken);
      localStorage.setItem('tz_refresh', j.refreshToken);
      setAdmin(j.admin);
      nav('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-black text-white">TZ</span>
          <div>
            <h1 className="text-lg font-extrabold leading-tight">TZ Store Admin</h1>
            <p className="text-xs text-slate-500">Sign in to manage your store</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">API: {BASE || 'same origin (proxy)'}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></Field>
          <Field label="Password"><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
