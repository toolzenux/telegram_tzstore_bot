// Typed fetch client with JWT access + refresh rotation.
const BASE = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ?? '';

function tokens() {
  return {
    access: localStorage.getItem('tz_access') ?? '',
    refresh: localStorage.getItem('tz_refresh') ?? '',
  };
}

async function refreshAccess(): Promise<string | null> {
  const { refresh } = tokens();
  if (refresh) {
    try {
      const r = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.accessToken) {
          localStorage.setItem('tz_access', j.accessToken);
          return j.accessToken as string;
        }
      }
    } catch {}
  }

  // Fallback: If inside Telegram WebApp with initData, re-authenticate seamlessly
  try {
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    if (tg?.initData) {
      const r = await fetch(`${BASE}/api/admin/auth/telegram`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j.accessToken) {
          localStorage.setItem('tz_access', j.accessToken);
          if (j.refreshToken) localStorage.setItem('tz_refresh', j.refreshToken);
          return j.accessToken as string;
        }
      }
    }
  } catch {}

  return null;
}

export async function api(path: string, opts: RequestInit = {}, retry = true): Promise<unknown> {
  const { access } = tokens();
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}), ...(opts.headers ?? {}) },
  });
  if (r.status === 401 && retry) {
    const next = await refreshAccess();
    if (next) return api(path, { ...opts, headers: { ...(opts.headers ?? {}), authorization: `Bearer ${next}` } }, false);
    // Don't kick Telegram WebApp users to desktop login screen
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
    const isMobileApp = typeof location !== 'undefined' && location.pathname.includes('/mobile');
    if (!tg?.initData && !isMobileApp) {
      localStorage.removeItem('tz_access');
      localStorage.removeItem('tz_refresh');
      const loginPath = location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
      if (location.pathname !== loginPath) location.href = loginPath;
    }
    throw new Error('session expired');
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? `request failed (${r.status})`);
  }
  return r.json();
}

export const get = (p: string) => api(p) as Promise<never>;
export const post = (p: string, body: unknown) => api(p, { method: 'POST', body: JSON.stringify(body) }) as Promise<never>;
export const patch = (p: string, body: unknown) => api(p, { method: 'PATCH', body: JSON.stringify(body) }) as Promise<never>;
export const del = (p: string) => api(p, { method: 'DELETE' }) as Promise<never>;
