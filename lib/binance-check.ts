import crypto from 'node:crypto';
import { db } from '@/lib/db';

let cachedKeys: { key: string; secret: string; exp: number } | null = null;
async function getBinanceKeys(): Promise<{ key: string; secret: string }> {
  if (cachedKeys && Date.now() < cachedKeys.exp) {
    return cachedKeys;
  }
  let key = process.env.BINANCE_SPOT_API_KEY ?? '';
  let secret = process.env.BINANCE_SPOT_SECRET ?? '';

  if (!process.env.VITEST) {
    try {
      const prisma = db();
      if (prisma) {
        const [dbKey, dbSecret] = await Promise.all([
          prisma.setting.findUnique({ where: { key: 'binanceSpotApiKey' } }),
          prisma.setting.findUnique({ where: { key: 'binanceSpotSecret' } }),
        ]);
        if (typeof dbKey?.value === 'string' && dbKey.value.trim().length > 10) {
          key = dbKey.value.trim();
        }
        if (typeof dbSecret?.value === 'string' && dbSecret.value.trim().length > 10) {
          secret = dbSecret.value.trim();
        }
      }
    } catch {}
  }
  cachedKeys = { key, secret, exp: Date.now() + 300_000 };
  return cachedKeys;
}

// Server-side Binance check for the website deposit flow (personal account).
// Looks up the TxID in our Spot USDT deposit history or Binance Pay transactions.
export async function checkTxidOnBinance(
  txid: string,
  expectedAmount?: number,
): Promise<{ state: 'matched' | 'not-found' | 'no-keys'; txid?: string; amount?: number; checked?: number; reason: string }> {
  const { key, secret } = await getBinanceKeys();

  if (!key || !secret) return { state: 'no-keys', reason: 'Auto-check not configured — admin will verify manually.' };
  const needle = txid.trim().toLowerCase();
  if (needle.length < 6) return { state: 'not-found', checked: 0, reason: 'TxID too short — must be at least 6 characters.' };

  try {
    const timestamp = String(Date.now());
    const qs = new URLSearchParams({ timestamp, recvWindow: '10000' }).toString();
    const sig = crypto.createHmac('sha256', secret).update(qs).digest('hex');

    // 1. Check Binance Pay & UID internal transfers (GET /sapi/v1/pay/transactions)
    try {
      const payRes = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': key },
      });
      if (payRes.ok) {
        const payData = (await payRes.json()) as { data?: Array<{ orderId?: string; transactionId?: string; amount?: string; transactionTime?: number }> };
        const payList = payData.data ?? [];
        const payHit = payList.find(
          (d) =>
            (d.orderId && d.orderId.toLowerCase().trim() === needle) ||
            (d.transactionId && d.transactionId.toLowerCase().trim() === needle),
        );
        if (payHit) {
          const amount = Math.abs(Number(payHit.amount));
          const hitTxid = payHit.orderId || payHit.transactionId || txid;
          if (expectedAmount !== undefined && Math.abs(amount - expectedAmount) > 0.011) {
            return { state: 'not-found', checked: payList.length, reason: `Found Binance Pay order of $${amount.toFixed(2)}, but this order needs $${expectedAmount.toFixed(2)} — admin will review.` };
          }
          return { state: 'matched', txid: hitTxid, amount, reason: `Matched Binance Pay transfer of $${amount.toFixed(2)}.` };
        }
      } else {
        const errJson = (await payRes.json().catch(() => ({}))) as { code?: number; msg?: string };
        if (errJson.code === -2008 || errJson.code === -2015) {
          return { state: 'not-found', checked: 0, reason: `Binance rejected API Key (${errJson.msg ?? 'Invalid API Key'}). Please verify your key in Binance API Management.` };
        }
      }
    } catch {}

    // 2. Check On-Chain Spot deposits (GET /sapi/v1/capital/deposit/hisrec)
    const depQs = new URLSearchParams({ coin: 'USDT', limit: '100', timestamp, recvWindow: '10000' }).toString();
    const depSig = crypto.createHmac('sha256', secret).update(depQs).digest('hex');
    const r = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${depQs}&signature=${depSig}`, {
      headers: { 'X-MBX-APIKEY': key },
    });
    if (!r.ok) {
      const errJson = (await r.json().catch(() => ({}))) as { code?: number; msg?: string };
      const isRestricted = errJson.msg && (errJson.msg.includes('restricted location') || errJson.msg.includes('Eligibility'));
      return {
        state: 'not-found',
        checked: 0,
        reason: isRestricted
          ? `TxID received! UID ${process.env.BINANCE_UID || '1134278389'} transfer under quick admin review — delivery will occur shortly.`
          : (errJson.msg ? `Binance API: ${errJson.msg}` : 'Binance API unreachable — admin will review manually.'),
      };
    }
    const list = (await r.json()) as Array<{ amount: string; txId?: string; status?: number }>;
    const ok = (Array.isArray(list) ? list : []).filter((d) => d.status === undefined || d.status === 1);
    const hit = ok.find((d) => d.txId && d.txId.toLowerCase().trim() === needle);
    if (!hit) return { state: 'not-found', checked: ok.length, reason: `TxID not found in recent deposits (checked ${ok.length}) — admin will review manually.` };
    const amount = Number(hit.amount);
    if (expectedAmount !== undefined && Math.abs(amount - expectedAmount) > 0.011) {
      return { state: 'not-found', checked: ok.length, reason: `Found $${amount.toFixed(2)} on Binance but order needs $${expectedAmount.toFixed(2)} — admin will review.` };
    }
    return { state: 'matched', txid: hit.txId || txid, amount, reason: `Matched $${amount.toFixed(2)} on Binance.` };
  } catch {
    return { state: 'not-found', checked: 0, reason: 'Check failed — admin will verify manually.' };
  }
}

let cachedCredited: { set: Set<string>; exp: number } | null = null;
async function getCreditedTxids(): Promise<Set<string>> {
  if (cachedCredited && Date.now() < cachedCredited.exp) {
    return new Set(cachedCredited.set);
  }
  const set = new Set<string>();
  if (!process.env.VITEST) {
    try {
      const prisma = db();
      if (prisma) {
        const creditedOrders = await prisma.order.findMany({
          where: { paymentStatus: 'PAID', txid: { not: null } },
          select: { txid: true, binancePayOrderNo: true },
        });
        for (const o of creditedOrders) {
          if (o.txid) set.add(o.txid.toLowerCase());
          if (o.binancePayOrderNo) set.add(o.binancePayOrderNo.toLowerCase());
        }
      }
    } catch {}
  }
  cachedCredited = { set, exp: Date.now() + 60_000 };
  return new Set(set);
}

// Auto-detect recent Binance payments for an intent without manual TxID entry
export async function autoMatchBinancePayment(
  expectedAmount: number,
  sinceMs?: number,
  excludeTxids: string[] = [],
): Promise<{ state: 'matched' | 'not-found' | 'no-keys'; txid?: string; amount?: number; reason: string }> {
  const { key, secret } = await getBinanceKeys();

  if (!key || !secret) return { state: 'no-keys', reason: 'Auto-check not configured' };

  try {
    const timestamp = String(Date.now());
    const qs = new URLSearchParams({ timestamp, recvWindow: '10000' }).toString();
    const sig = crypto.createHmac('sha256', secret).update(qs).digest('hex');

    // Fetch already credited TxIDs from memory cache
    const alreadyCredited = await getCreditedTxids();
    for (const t of excludeTxids) alreadyCredited.add(t.toLowerCase());

    // 1. Check Binance Pay
    try {
      const payRes = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${qs}&signature=${sig}`, {
        headers: { 'X-MBX-APIKEY': key },
      });
      if (payRes.ok) {
        const payData = (await payRes.json()) as { data?: Array<{ orderId?: string; transactionId?: string; amount?: string; transactionTime?: number }> };
        const payList = payData.data ?? [];
        const cutoff = sinceMs ? sinceMs - 15 * 60 * 1000 : Date.now() - 60 * 60 * 1000;
        
        for (const item of payList) {
          const amount = Math.abs(Number(item.amount));
          const tTime = item.transactionTime || 0;
          const id = item.orderId || item.transactionId;
          if (!id) continue;
          if (alreadyCredited.has(id.toLowerCase())) continue;
          if (tTime < cutoff) continue;
          if (Math.abs(amount - expectedAmount) <= 0.011) {
            return {
              state: 'matched',
              txid: id,
              amount,
              reason: `Auto-matched Binance Pay order ${id} for $${amount.toFixed(2)}`,
            };
          }
        }
      }
    } catch {}

    // 2. Check On-chain deposits
    try {
      const depQs = new URLSearchParams({ coin: 'USDT', limit: '50', timestamp, recvWindow: '10000' }).toString();
      const depSig = crypto.createHmac('sha256', secret).update(depQs).digest('hex');
      const depRes = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${depQs}&signature=${depSig}`, {
        headers: { 'X-MBX-APIKEY': key },
      });
      if (depRes.ok) {
        const depList = (await depRes.json()) as Array<{ amount: string; txId?: string; status?: number; insertTime?: number }>;
        const ok = (Array.isArray(depList) ? depList : []).filter((d) => d.status === undefined || d.status === 1);
        const cutoff = sinceMs ? sinceMs - 15 * 60 * 1000 : Date.now() - 60 * 60 * 1000;
        for (const d of ok) {
          if (!d.txId) continue;
          if (alreadyCredited.has(d.txId.toLowerCase())) continue;
          if (d.insertTime && d.insertTime < cutoff) continue;
          const amount = Number(d.amount);
          if (Math.abs(amount - expectedAmount) <= 0.011) {
            return {
              state: 'matched',
              txid: d.txId,
              amount,
              reason: `Auto-matched on-chain deposit ${d.txId} for $${amount.toFixed(2)}`,
            };
          }
        }
      }
    } catch {}

    return { state: 'not-found', reason: 'No matching payment found yet' };
  } catch (e: any) {
    return { state: 'not-found', reason: e.message || 'Auto-match check failed' };
  }
}
