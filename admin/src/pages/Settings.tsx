import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, get, post } from '../api';
import { Button, Card, Field, Input, Skeleton, toast } from '../ui';

const TABS = ['General', 'Bot', 'Payments', 'Referral', 'Wallet', 'Security'] as const;

import { displaySettingValue, secretPlaceholder, shouldSkipSecret, normalizeSettingInput } from '../settings-util';

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('General');
  const [form, setForm] = useState<Record<string, string>>({});
  const [pwd, setPwd] = useState({ cur: '', next: '' });
  const [testingBinance, setTestingBinance] = useState(false);
  const [binanceTestResult, setBinanceTestResult] = useState<any>(null);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => get('/api/settings') as Promise<Record<string, unknown>> });
  const s = settings.data ?? {};
  const val = (k: string) => displaySettingValue(form, s, k);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const secretPh = (k: string) => secretPlaceholder(s[k]);

  async function testBinance() {
    setTestingBinance(true);
    setBinanceTestResult(null);
    try {
      const res = (await get('/api/admin/binance/test')) as any;
      setBinanceTestResult(res);
      if (res.ok) {
        toast('✅ Binance API is active & connected!');
      } else {
        toast(`❌ ${res.error || 'Connection failed'}`);
      }
    } catch (e: any) {
      setBinanceTestResult({ ok: false, error: e.message || 'Network error' });
      toast('❌ Failed to test Binance API');
    } finally {
      setTestingBinance(false);
    }
  }

  async function save(keys: string[], parseJson: string[] = []) {
    try {
      for (const k of keys) {
        const raw = normalizeSettingInput(val(k));
        if (shouldSkipSecret(k, raw)) continue; // keep saved secret
        const value = parseJson.includes(k) ? JSON.parse(raw || '{}') : (isNaN(Number(raw)) || raw === '' ? raw : Number(raw));
        await api('/api/settings', { method: 'PUT', body: JSON.stringify({ key: k, value }) });
      }
      toast('✅ Settings saved successfully'); setForm({}); settings.refetch();
    } catch (e) { toast(e instanceof Error ? e.message : 'failed'); }
  }

  async function changePwd() {
    try {
      await post('/api/auth/change-password', { oldPassword: pwd.cur, newPassword: pwd.next });
      toast('Password changed'); setPwd({ cur: '', next: '' });
    } catch (e) { toast(e instanceof Error ? e.message : 'failed'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">{TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900'}`}>{t}</button>
      ))}</div>
      {settings.isLoading ? <Skeleton className="h-48" /> : (
        <>
          {tab === 'General' && <Card><div className="space-y-4">
            <div>
              <h3 className="font-bold text-base">Store Profile & Branding</h3>
              <p className="text-xs text-slate-500">Configure your store name, customer support, and official announcement channels. These reflect dynamically across your customer storefront, Telegram Mini App header, About page, and Telegram bots.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Store Name"><Input value={val('storeName')} onChange={(e) => set('storeName', e.target.value)} placeholder="e.g. TZ Store" /></Field>
              <Field label="Support URL"><Input value={val('supportUrl')} onChange={(e) => set('supportUrl', e.target.value)} placeholder="https://t.me/TzStore_Support" /></Field>
              <Field label="Channel URL"><Input value={val('channelUrl')} onChange={(e) => set('channelUrl', e.target.value)} placeholder="https://t.me/TZStoreChannel" /></Field>
            </div>
            <div><Button onClick={() => save(['storeName', 'supportUrl', 'channelUrl'])}>Save general settings</Button></div>
          </div></Card>}
          {tab === 'Bot' && <Card><div className="grid gap-3 md:grid-cols-2">
            <Field label="Bot token"><Input type="password" value={val('botToken')} onChange={(e) => set('botToken', e.target.value)} placeholder={secretPh('botToken')} /></Field>
            <Field label="Admin notify chat id"><Input value={val('adminNotifyChatId')} onChange={(e) => set('adminNotifyChatId', e.target.value)} /></Field>
            <Field label="Support URL"><Input value={val('supportUrl')} onChange={(e) => set('supportUrl', e.target.value)} /></Field>
            <Field label="Channel URL"><Input value={val('channelUrl')} onChange={(e) => set('channelUrl', e.target.value)} /></Field>
            <div className="md:col-span-2"><Button onClick={() => save(['botToken', 'adminNotifyChatId', 'supportUrl', 'channelUrl'])}>Save bot settings</Button></div>
          </div></Card>}
          {tab === 'Payments' && <div className="space-y-3">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">🟡 Personal Binance account <span className="text-xs font-normal text-slate-500">(no merchant needed — recommended)</span></h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active on Server
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Buyers send USDT to your UID, submit the TXID/Order ID, and the panel auto-checks your Spot deposit history. UID-to-UID transfers still need one-tap manual approve.</p>
              
              {binanceTestResult && (
                <div className={`mt-3 rounded-xl p-3 text-xs ${binanceTestResult.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {binanceTestResult.ok ? (
                    <div>
                      <p className="font-bold text-sm">✅ Binance API Connected Successfully!</p>
                      <p className="mt-1">🔑 Key: <code>{binanceTestResult.keyMasked}</code></p>
                      <p>📖 Read Access: {binanceTestResult.permissions?.enableReading ? 'Enabled ✅' : 'Disabled ❌'}</p>
                      <p>💳 Recent Transfers Found: {binanceTestResult.recentPayTransactions} records</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-sm">❌ Connection Error:</p>
                      <p className="mt-1">{binanceTestResult.error}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Field label="Store Binance UID (shown to buyers)"><Input value={val('binanceUid')} onChange={(e) => set('binanceUid', e.target.value)} placeholder="e.g. 1134278389" inputMode="numeric" /></Field>
                <Field label="Spot API Key (auto-verify)"><Input value={val('binanceSpotApiKey')} onChange={(e) => set('binanceSpotApiKey', e.target.value)} placeholder={secretPh('binanceSpotApiKey')} /></Field>
                <Field label="Spot API Secret"><Input type="password" value={val('binanceSpotSecret')} onChange={(e) => set('binanceSpotSecret', e.target.value)} placeholder={secretPh('binanceSpotSecret')} /></Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => save(['binanceUid', 'binanceSpotApiKey', 'binanceSpotSecret'])}>Save personal account</Button>
                <button
                  type="button"
                  disabled={testingBinance}
                  onClick={testBinance}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {testingBinance ? '⚡ Testing Connection…' : '⚡ Test Binance Connection'}
                </button>
              </div>
            </Card>
            <Card><h3 className="font-bold">🏦 Binance Pay merchant <span className="text-xs font-normal text-slate-500">(optional — only with merchant account)</span></h3>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <Field label="Binance Merchant ID"><Input value={val('binanceMerchantId')} onChange={(e) => set('binanceMerchantId', e.target.value)} /></Field>
                <Field label="Binance API Key"><Input value={val('binanceApiKey')} onChange={(e) => set('binanceApiKey', e.target.value)} placeholder={secretPh('binanceApiKey')} /></Field>
                <Field label="Binance Secret"><Input type="password" value={val('binanceSecret')} onChange={(e) => set('binanceSecret', e.target.value)} placeholder={secretPh('binanceSecret')} /></Field>
                <div className="md:col-span-2"><Button onClick={() => save(['binanceMerchantId', 'binanceApiKey', 'binanceSecret'])}>Save merchant keys</Button></div>
              </div>
            </Card>
          </div>}
          {tab === 'Referral' && <Card><div className="max-w-60">
            <Field label="Commission %"><Input type="number" value={val('referralPercent')} onChange={(e) => set('referralPercent', e.target.value)} /></Field>
            <div className="mt-2"><Button onClick={() => save(['referralPercent'])}>Save</Button></div>
          </div></Card>}
          {tab === 'Wallet' && <Card><div className="grid gap-3 md:grid-cols-2">
            <Field label="Min deposit"><Input type="number" value={val('minDeposit')} onChange={(e) => set('minDeposit', e.target.value)} /></Field>
            <Field label="Manual addresses JSON {TRC20,BEP20}"><Input value={val('manualAddresses')} onChange={(e) => set('manualAddresses', e.target.value)} /></Field>
            <div className="md:col-span-2"><Button onClick={() => save(['minDeposit', 'manualAddresses'], ['manualAddresses'])}>Save wallet settings</Button></div>
          </div></Card>}
          {tab === 'Security' && <Card><div className="grid max-w-md gap-3">
            <Field label="Current password"><Input type="password" value={pwd.cur} onChange={(e) => setPwd({ ...pwd, cur: e.target.value })} /></Field>
            <Field label="New password"><Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} /></Field>
            <Button onClick={changePwd}>Change password</Button>
          </div></Card>}
        </>
      )}
    </div>
  );
}
