'use client';
// Thin Telegram WebApp wrapper: works in Telegram + browser fallback.
export type TgWebApp = any;
export function tg(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as any)?.Telegram?.WebApp ?? null;
}
export function initTma() {
  const w = tg();
  if (!w) return null;
  try {
    w.ready(); w.expand();
    w.setHeaderColor?.('#E8F3E8'); w.setBackgroundColor?.('#E8F3E8');
  } catch {}
  return w;
}
export function haptic(kind: 'success' | 'error' | 'warning' | 'light' | 'medium' | 'heavy' = 'light') {
  try {
    const w = tg();
    if (kind === 'light' || kind === 'medium' || kind === 'heavy') {
      w?.HapticFeedback?.impactOccurred?.(kind);
    } else {
      w?.HapticFeedback?.notificationOccurred?.(kind);
    }
  } catch {}
}
export function mainButton(text: string, onClick: () => void) {
  const w = tg();
  if (!w?.MainButton) return () => {};
  w.MainButton.setText(text); w.MainButton.show(); w.MainButton.onClick(onClick);
  return () => { try { w.MainButton.offClick(onClick); w.MainButton.hide(); } catch {} };
}
export function backButton(onClick: () => void) {
  const w = tg();
  if (!w?.BackButton) return () => {};
  w.BackButton.show(); w.BackButton.onClick(onClick);
  return () => { try { w.BackButton.offClick(onClick); w.BackButton.hide(); } catch {} };
}
export function initDataRaw(): string {
  if (typeof window === 'undefined') return '';
  return (window as any)?.Telegram?.WebApp?.initData ?? '';
}
// Owner JWT for buyer-only APIs (order create/read, intents). Empty = anonymous.
export function tzToken(): string {
  if (typeof window === 'undefined') return '';
  const t = localStorage.getItem('tz_jwt') ?? '';
  return t && t !== 'dev' ? t : '';
}
export function tzAuthHeader(): Record<string, string> {
  const t = tzToken();
  const initData = initDataRaw();
  const headers: Record<string, string> = {};
  if (t) headers.authorization = `Bearer ${t}`;
  if (initData) headers['x-telegram-init-data'] = initData;
  return headers;
}
