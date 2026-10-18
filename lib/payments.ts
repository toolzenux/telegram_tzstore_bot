import crypto from 'crypto';
export const PROVIDERS = ['STARS', 'BINANCE', 'TRC20', 'BEP20', 'BTC'] as const;
export type Provider = (typeof PROVIDERS)[number];
export function newId(prefix: string) { return `${prefix}_${crypto.randomBytes(8).toString('hex')}`; }
// Stars conversion: Bot API rate varies; store USDT total + stars amount at invoice time.
export function starsFor(usdt: number) { return Math.max(1, Math.round(usdt * 70)); }
export function demoAddress(provider: Provider, intentId: string) {
  if (provider === 'TRC20') return 'TEmStoreDemoTRC20' + intentId.slice(-8);
  if (provider === 'BEP20') return process.env.NEXT_PUBLIC_BEP20_WALLET_ADDRESS || process.env.BEP20_WALLET_ADDRESS || '0x620b6207d03e59ccf1d1356f78a4f8e9078cf711';
  if (provider === 'BTC') return 'bc1qemstoredemo' + intentId.slice(-8);
  return undefined;
}
export async function createStarsInvoiceLink(title: string, payload: string, starsAmount: number): Promise<string> {
  const token = process.env.BOT_TOKEN ?? '';
  if (!token) return `https://t.me/invoice/dev_${payload}`;
  const r = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, description: title, payload, currency: 'XTR', prices: [{ label: title, amount: starsAmount }] }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description ?? 'stars invoice failed');
  return j.result as string;
}
