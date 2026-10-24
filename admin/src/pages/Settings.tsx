import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, get, post } from '../api';
import { Button, Card, Field, Input, Skeleton, toast } from '../ui';
import { Upload, ImagePlus, X, Sparkles } from 'lucide-react';
import { tzUploadPhoto } from '../tzstore';

const TABS = ['General', 'Bot', 'Payments', 'Referral', 'Wallet', 'Security'] as const;

import { displaySettingValue, secretPlaceholder, shouldSkipSecret, normalizeSettingInput } from '../settings-util';

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('General');
  const [form, setForm] = useState<Record<string, string>>({});
  const [pwd, setPwd] = useState({ cur: '', next: '' });
  const [testingBinance, setTestingBinance] = useState(false);
  const [binanceTestResult, setBinanceTestResult] = useState<any>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => get('/api/settings') as Promise<Record<string, unknown>> });
  const s = settings.data ?? {};
  const val = (k: string) => displaySettingValue(form, s, k);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const secretPh = (k: string) => secretPlaceholder(s[k]);

  async function onLogoFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file (PNG/JPG/SVG/WebP)'); return; }
    if (f.size > 2 * 1024 * 1024) { toast('Image must be under 2MB'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(f);
    });
    setLogoUploading(true);
    try {
      const j = await tzUploadPhoto(f.name, dataUrl);
      set('storeLogo', j.url);
      toast('✅ Logo uploaded successfully');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

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
    setSaving(true);
    setSavedNotice(null);
    try {
      const settingsPayload: Record<string, unknown> = {};
      for (const k of keys) {
        const raw = normalizeSettingInput(val(k));
        if (shouldSkipSecret(k, raw)) continue; // keep saved secret
        const value = parseJson.includes(k) ? JSON.parse(raw || '{}') : (isNaN(Number(raw)) || raw === '' ? raw : Number(raw));
        settingsPayload[k] = value;
      }
      
      // Batch save all settings in one fast parallel request
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: settingsPayload }),
      });

      if (keys.includes('storeName') || keys.includes('storeLogo')) {
        const newName = val('storeName') || 'TZ Store';
        const newLogo = val('storeLogo') || '';
        window.dispatchEvent(new CustomEvent('tz:storeNameChanged', { detail: { storeName: newName, storeLogo: newLogo } }));
      }
      
      setSavedNotice('✅ Settings saved successfully!');
      toast('✅ Settings saved successfully');
      setForm({});
      settings.refetch();
      setTimeout(() => setSavedNotice(null), 4000);
    } catch (e: any) {
      console.error('Save settings error:', e);
      const msg = e instanceof Error ? e.message : 'Failed to save settings';
      setSavedNotice(`❌ Error: ${msg}`);
      toast(`❌ ${msg}`);
    } finally {
      setSaving(false);
    }
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
              <p className="text-xs text-slate-500">Configure your store name, logo, customer support, and official announcement channels. These reflect dynamically across your customer storefront, Telegram Mini App header, About page, and Telegram bots.</p>
            </div>

            {/* Store Logo Section */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">Store Logo / Brand Icon</label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800">
                  {val('storeLogo') ? (
                    <img
                      src={val('storeLogo')}
                      alt="Store logo"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.opacity = '0.3';
                      }}
                    />
                  ) : (
                    <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                      {val('storeName') ? val('storeName').slice(0, 2).toUpperCase() : 'TZ'}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-[240px] space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={val('storeLogo')}
                      onChange={(e) => set('storeLogo', e.target.value)}
                      placeholder="Paste Image URL (https://... or /logos/brand.svg)"
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => logoFileRef.current?.click()}
                      disabled={logoUploading}
                      className="shrink-0 text-xs"
                    >
                      <Upload size={14} className="mr-1" />
                      {logoUploading ? 'Uploading…' : 'Upload'}
                    </Button>
                    {val('storeLogo') && (
                      <button
                        type="button"
                        onClick={() => set('storeLogo', '')}
                        className="rounded-xl px-2 py-1 text-xs text-slate-400 hover:text-red-500"
                        title="Remove logo"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onLogoFile(e.target.files?.[0])}
                  />
                  <p className="text-[11px] text-slate-400">
                    PNG, JPG, SVG, or WebP under 2MB. Or paste a direct image URL from any web host.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Store Name"><Input value={val('storeName')} onChange={(e) => set('storeName', e.target.value)} placeholder="e.g. TZ Store" /></Field>
              <Field label="Support URL"><Input value={val('supportUrl')} onChange={(e) => set('supportUrl', e.target.value)} placeholder="https://t.me/TzStore_Support" /></Field>
              <Field label="Channel URL"><Input value={val('channelUrl')} onChange={(e) => set('channelUrl', e.target.value)} placeholder="https://t.me/TZStoreChannel" /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                onClick={() => save(['storeName', 'storeLogo', 'supportUrl', 'channelUrl'])}
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Saving store branding & settings…</span>
                  </>
                ) : (
                  <span>Save store branding & settings</span>
                )}
              </Button>
              {savedNotice && (
                <span className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all animate-in fade-in duration-200 ${
                  savedNotice.startsWith('✅')
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {savedNotice}
                </span>
              )}
            </div>
          </div></Card>}
          {tab === 'Bot' && <Card><div className="grid gap-3 md:grid-cols-2">
            <Field label="Bot token"><Input type="password" value={val('botToken')} onChange={(e) => set('botToken', e.target.value)} placeholder={secretPh('botToken')} /></Field>
            <Field label="Admin notify chat id"><Input value={val('adminNotifyChatId')} onChange={(e) => set('adminNotifyChatId', e.target.value)} /></Field>
            <Field label="Support URL"><Input value={val('supportUrl')} onChange={(e) => set('supportUrl', e.target.value)} /></Field>
            <Field label="Channel URL"><Input value={val('channelUrl')} onChange={(e) => set('channelUrl', e.target.value)} /></Field>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <Button onClick={() => save(['botToken', 'adminNotifyChatId', 'supportUrl', 'channelUrl'])} disabled={saving}>
                {saving ? 'Saving…' : 'Save bot settings'}
              </Button>
              {savedNotice && <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{savedNotice}</span>}
            </div>
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
