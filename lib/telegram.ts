import crypto from 'crypto';
// Validates Telegram Mini App initData HMAC-SHA256 with bot token.
// initData: raw query string e.g. "user=...&auth_date=...&hash=..."
export function validateInitData(initData: string, botToken: string, maxAgeSec = 3600): { ok: boolean; user?: any; reason?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, reason: 'missing hash' };
    if (!/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'bad hash' };
    params.delete('hash');
    const dataCheckString = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    const calcBuf = Buffer.from(calc, 'hex');
    const hashBuf = Buffer.from(hash, 'hex');
    if (calcBuf.length !== 32 || hashBuf.length !== 32 || !crypto.timingSafeEqual(calcBuf, hashBuf)) {
      return { ok: false, reason: 'bad hash' };
    }
    const authDate = Number(params.get('auth_date') ?? 0);
    const nowSec = Date.now() / 1000;
    const diff = nowSec - authDate;
    if (diff < -60 || (maxAgeSec > 0 && diff > maxAgeSec)) return { ok: false, reason: 'expired' };
    const userRaw = params.get('user');
    return { ok: true, user: userRaw ? JSON.parse(userRaw) : undefined };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error' };
  }
}
export function parseStartParam(initData: string): string | null {
  try {
    const p = new URLSearchParams(initData);
    const sp = p.get('start_param') ?? p.get('startapp');
    return sp;
  } catch { return null; }
}
