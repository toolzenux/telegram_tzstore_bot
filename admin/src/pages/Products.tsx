import { useMemo, useRef, useState, Fragment } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, Package, Plus, ImagePlus, X, KeyRound, Eye, EyeOff, Trash2, Copy, Upload, Search, Smartphone, Layers, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, getPaginationRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { tzGetProducts, tzGetCategories, tzCreateProduct, tzCreateCategory, tzUpdateProduct, tzDeleteProduct, tzReorderProducts, tzUploadPhoto, tzLogoUrl, tzVaultList, tzVaultAdd, tzVaultImport, tzVaultDelete, tzVaultUpdate, type TzProduct, type VaultRow } from '../tzstore';
import { Badge, Button, Card, Modal, Confirm, Empty, Field, Input, Select, Skeleton, Textarea, toast } from '../ui';

const col = createColumnHelper<TzProduct & { categoryName: string }>();

function VaultSection({ productId, stock, onChanged }: { productId: string; stock: number; onChanged: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [bulk, setBulk] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const vault = useQuery({ queryKey: ['tz-vault', productId], queryFn: () => tzVaultList(productId) });
  const rows = (vault.data?.rows ?? []) as VaultRow[];

  async function refresh() { await vault.refetch(); onChanged(); }

  async function addOne() {
    if (!login.trim() || !password) { toast('Account ID and password required'); return; }
    setBusy(true);
    try {
      await tzVaultAdd(productId, login.trim(), password);
      toast('Account added'); setLogin(''); setPassword('');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'add failed'); }
    finally { setBusy(false); }
  }

  async function importBulk() {
    const lines = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    try {
      const j = await tzVaultImport(productId, lines.join('\n'));
      toast(`Imported ${j.imported}${j.skipped ? `, skipped ${j.skipped}` : ''}`);
      setBulk('');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'import failed'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try { await tzVaultDelete(id); toast('Deleted'); await refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'delete failed'); }
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-bold"><KeyRound size={16} /> Delivery vault <Badge tone="green">{vault.data ? `${vault.data.available} available` : `${stock} in stock`}</Badge></h3>
      <p className="text-xs text-slate-500">Accounts auto-deliver on successful payment — one row per unit bought.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Account ID"><Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="user@mail.com" /></Field>
        <Field label="Password"><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="secret" /></Field>
      </div>
      <Button onClick={addOne} disabled={busy} className="w-full">{busy ? '…' : 'Add account'}</Button>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Format: <code className="text-purple-600 dark:text-purple-400">login | pass</code> or <code className="text-purple-600 dark:text-purple-400">login:pass</code></span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              try {
                const txt = await navigator.clipboard.readText();
                if (txt) { setBulk(txt); toast('Pasted from clipboard'); }
              } catch { toast('Clipboard permission denied'); }
            }}
            className="rounded border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800"
          >📋 Paste</button>
          <button
            type="button"
            onClick={() => {
              setBulk('sample_user1@tzstore.io | Pass123!\nsample_user2@tzstore.io:Pass456!\nsample_user3@tzstore.io----Pass789!');
              toast('Sample accounts loaded');
            }}
            className="rounded border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 text-[11px]"
          >🧪 Sample</button>
          {bulk && (
            <button
              type="button"
              onClick={() => setBulk('')}
              className="text-red-500 hover:text-red-600 text-[11px] px-1"
            >Clear</button>
          )}
        </div>
      </div>
      <Textarea
        rows={3}
        placeholder={'Paste accounts here (one per line)...\nSupported: login | password, login:password, login----password'}
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
      />
      <div className="flex items-center justify-between text-xs">
        <span className={bulk.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
          {bulk.trim() ? `✓ ${bulk.trim().split('\n').filter(Boolean).length} accounts detected` : '0 accounts entered'}
        </span>
        <Button variant="green" onClick={importBulk} disabled={busy || !bulk.trim()}>
          {busy ? 'Importing…' : 'Import to vault'}
        </Button>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
        {vault.isLoading ? <p className="p-3 text-xs text-slate-500">Loading…</p> : rows.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">Vault empty — paid orders will wait for manual review.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 dark:border-slate-800">
                <td className="p-2 font-mono">{r.login}</td>
                <td className="p-2 font-mono">{revealed[r.id] ? r.password : '••••••'}</td>
                <td className="p-2">
                  <button onClick={() => setRevealed((v) => ({ ...v, [r.id]: !v[r.id] }))} className="text-slate-400 hover:text-slate-600">
                    {revealed[r.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </td>
                <td className="p-2"><Badge tone={r.status === 'AVAILABLE' ? 'green' : 'gray'}>{r.status === 'AVAILABLE' ? 'READY' : `SOLD ${r.orderId?.slice(-6) ?? ''}`}</Badge></td>
                <td className="p-2 text-right">
                  {r.status === 'AVAILABLE' && (
                    <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Delivery-ready table — expandable sub-row under a product.
// Shows vault credentials ready for auto-delivery + add/bulk-import.
function DeliveryReadyTable({ product, onCollapse, onChanged }: { product: TzProduct; onCollapse: () => void; onChanged: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [bulk, setBulk] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [editingRow, setEditingRow] = useState<VaultRow | null>(null);
  const [editLogin, setEditLogin] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editStatus, setEditStatus] = useState<'AVAILABLE' | 'SOLD'>('AVAILABLE');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Responsive Search & Filters for Delivery Vault
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single');

  const vault = useQuery({ queryKey: ['tz-vault', product.id], queryFn: () => tzVaultList(product.id) });
  const rows = (vault.data?.rows ?? []) as VaultRow[];
  const available = rows.filter((r) => r.status === 'AVAILABLE').length;
  const sold = rows.length - available;

  const filteredRows = rows.filter((r) => {
    if (filter === 'AVAILABLE' && r.status !== 'AVAILABLE') return false;
    if (filter === 'SOLD' && r.status !== 'SOLD') return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return r.login.toLowerCase().includes(q) || (r.orderId && r.orderId.toLowerCase().includes(q));
    }
    return true;
  });

  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { toast('Copy failed'); }
  };

  async function refresh() { await vault.refetch(); onChanged(); }

  async function addOne() {
    if (!login.trim() || !password) { toast('Login and password required'); return; }
    setBusy(true);
    try {
      await tzVaultAdd(product.id, login.trim(), password);
      toast('Delivery item added'); setLogin(''); setPassword('');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'add failed'); }
    finally { setBusy(false); }
  }

  async function importBulk() {
    const lines = bulk.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    try {
      const j = await tzVaultImport(product.id, lines.join('\n'));
      toast(`Imported ${j.imported}${j.skipped ? `, skipped ${j.skipped}` : ''}`);
      setBulk('');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'import failed'); }
    finally { setBusy(false); }
  }

  function startEdit(r: VaultRow) {
    setEditingRow(r);
    setEditLogin(r.login);
    setEditPassword(r.password);
    setEditStatus(r.status);
  }

  async function saveEdit() {
    if (!editingRow) return;
    if (!editLogin.trim() || !editPassword) { toast('Login and password required'); return; }
    setSavingEdit(true);
    try {
      await tzVaultUpdate(editingRow.id, { login: editLogin.trim(), password: editPassword, status: editStatus });
      toast('Delivery item updated');
      setEditingRow(null);
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'update failed'); }
    finally { setSavingEdit(false); }
  }

  async function doDelete() {
    if (!deletingId) return;
    try {
      await tzVaultDelete(deletingId);
      toast('Delivery item deleted');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  const shortDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toISOString().slice(0, 10);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 space-y-3.5">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 shrink-0">
            <Package size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] sm:text-[15px] font-extrabold text-slate-900 dark:text-white truncate">
              Delivery ready — {product.title}
            </h3>
            <p className="text-[11px] text-slate-500 truncate">Accounts auto-deliver upon successful payment</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setFilter(filter === 'AVAILABLE' ? 'ALL' : 'AVAILABLE')}
            className={`cursor-pointer transition active:scale-95 ${filter === 'AVAILABLE' ? 'ring-2 ring-emerald-500 rounded-lg' : ''}`}
          >
            <Badge tone="green">AVAILABLE&nbsp;&nbsp;{vault.data ? available : product.stock}</Badge>
          </button>
          <button
            onClick={() => setFilter(filter === 'SOLD' ? 'ALL' : 'SOLD')}
            className={`cursor-pointer transition active:scale-95 ${filter === 'SOLD' ? 'ring-2 ring-slate-500 rounded-lg' : ''}`}
          >
            <Badge tone="gray">SOLD&nbsp;&nbsp;{sold}</Badge>
          </button>
          <button
            onClick={onCollapse}
            aria-label="Collapse"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Search & View Switcher Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search login, email or order #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8.5 pr-8 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Filter Pills */}
          <div className="flex items-center gap-1">
            {(['ALL', 'AVAILABLE', 'SOLD'] as const).map((f) => {
              const active = filter === f;
              const count = f === 'ALL' ? rows.length : f === 'AVAILABLE' ? available : sold;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition flex items-center gap-1.5 ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  <span>{f === 'ALL' ? 'All' : f === 'AVAILABLE' ? 'Available' : 'Sold'}</span>
                  <span className={`px-1 rounded text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* View Mode */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                viewMode === 'cards' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Smartphone size={11} />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                viewMode === 'table' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Layers size={11} />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cards View (Mobile Telegram optimized) */}
      {viewMode === 'cards' ? (
        <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-0.5">
          {vault.isLoading ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
              Loading delivery items…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
              No delivery items found.
            </div>
          ) : (
            filteredRows.map((r, idx) => {
              const isAvail = r.status === 'AVAILABLE';
              const isRevealed = !!revealed[r.id];

              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border p-3 space-y-2.5 transition ${
                    isAvail
                      ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-500/20 dark:bg-emerald-950/10'
                      : 'border-slate-200 bg-slate-50/50 dark:border-slate-700/60 dark:bg-slate-800/40 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200 dark:bg-slate-800 text-[9px] font-mono text-slate-600 dark:text-slate-400 shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white break-all select-all">
                        {r.login}
                      </span>
                    </div>
                    <Badge tone={isAvail ? 'green' : 'gray'}>{r.status}</Badge>
                  </div>

                  {/* Password row */}
                  <div className="rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <KeyRound size={13} className="text-slate-400 shrink-0" />
                      <span className="text-[10px] text-slate-500 font-semibold uppercase shrink-0">Pass:</span>
                      <span className={`font-mono text-xs truncate ${isRevealed ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 tracking-widest'}`}>
                        {isRevealed ? r.password : '••••••••'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setRevealed((v) => ({ ...v, [r.id]: !v[r.id] }))}
                        className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        title={isRevealed ? 'Hide' : 'Reveal'}
                      >
                        {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => copy(r.password, 'Password copied')}
                        className="rounded-lg p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        title="Copy password"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Order info */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5">
                    {r.orderId ? (
                      <div className="flex items-center gap-1.5 font-mono">
                        <span>Order:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">#{r.orderId.slice(-8).toUpperCase()}</span>
                        <span>•</span>
                        <span>{shortDate(r.soldAt)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle size={11} />
                        <span>Ready for auto-delivery</span>
                      </div>
                    )}
                  </div>

                  {/* Touch Action Row */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => copy(`${r.login} | ${r.password}`, 'Credentials copied')}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition"
                    >
                      <Copy size={12} className="text-slate-400" />
                      <span>Copy Both</span>
                    </button>
                    <button
                      onClick={() => startEdit(r)}
                      className="flex items-center justify-center gap-1 rounded-xl bg-blue-50 dark:bg-blue-600/15 hover:bg-blue-100 dark:hover:bg-blue-600/25 py-1.5 px-3 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 transition"
                    >
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => setDeletingId(r.id)}
                      className="flex items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 py-1.5 px-3 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 max-h-[50vh]">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                <th className="p-2.5">Login</th>
                <th className="p-2.5">Password</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5">Order / Sold at</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vault.isLoading ? (
                <tr><td colSpan={5} className="p-3 text-xs text-slate-500">Loading delivery items…</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={5} className="p-3 text-xs text-slate-500">No delivery items match criteria.</td></tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id} className="border-t dark:border-slate-800">
                  <td className="p-2.5 font-mono text-[13px]">{r.login}</td>
                  <td className="p-2.5">
                    <span className="flex items-center gap-1.5 font-mono text-[13px]">
                      {revealed[r.id] ? r.password : '••••••••'}
                      <button onClick={() => setRevealed((v) => ({ ...v, [r.id]: !v[r.id] }))} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-slate-700 dark:border-slate-700" aria-label="Reveal">
                        {revealed[r.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button onClick={() => copy(r.password, 'Password copied')} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-slate-700 dark:border-slate-700" aria-label="Copy password"><Copy size={13} /></button>
                    </span>
                  </td>
                  <td className="p-2.5"><Badge tone={r.status === 'AVAILABLE' ? 'green' : 'gray'}>{r.status}</Badge></td>
                  <td className="p-2.5 font-mono text-xs text-slate-500">{r.orderId ? `#${r.orderId.slice(-8).toUpperCase()}` : '#—'} · {shortDate(r.soldAt)}</td>
                  <td className="p-2.5">
                    <span className="flex justify-end gap-1.5">
                      <button onClick={() => startEdit(r)} className="rounded-md border border-slate-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-slate-700" aria-label="Edit" title="Edit delivery item"><Pencil size={13} /></button>
                      <button onClick={() => copy(`${r.login} | ${r.password}`, 'Login + password copied')} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:text-slate-700 dark:border-slate-700" aria-label="Copy row" title="Copy row"><Copy size={13} /></button>
                      <button onClick={() => setDeletingId(r.id)} className="rounded-md border border-slate-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-slate-700" aria-label="Delete" title="Delete delivery item"><Trash2 size={13} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabbed Add & Bulk Import */}
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 space-y-2.5">
        <div className="flex items-center rounded-lg bg-slate-200/70 dark:bg-slate-900/60 p-1">
          <button
            onClick={() => setAddTab('single')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
              addTab === 'single' ? 'bg-white dark:bg-emerald-600 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Plus size={13} />
            <span>Add Single</span>
          </button>
          <button
            onClick={() => setAddTab('bulk')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
              addTab === 'bulk' ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Upload size={13} />
            <span>Bulk Import</span>
          </button>
        </div>

        {addTab === 'single' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Login (email/username)" className="flex-1" />
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="flex-1" />
            <Button variant="green" onClick={addOne} disabled={busy} className="shrink-0">Add</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Format: <code className="text-purple-600 dark:text-purple-400">login | pass</code> or <code className="text-purple-600 dark:text-purple-400">login:pass</code> or <code className="text-purple-600 dark:text-purple-400">login----pass</code></span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const txt = await navigator.clipboard.readText();
                      if (txt) { setBulk(txt); toast('Pasted from clipboard'); }
                    } catch { toast('Clipboard permission denied'); }
                  }}
                  className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >📋 Paste</button>
                <button
                  type="button"
                  onClick={() => {
                    setBulk('sample_user1@tzstore.io | Pass123!\nsample_user2@tzstore.io:Pass456!\nsample_user3@tzstore.io----Pass789!');
                    toast('Sample accounts loaded');
                  }}
                  className="rounded-md border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-xs transition"
                >🧪 Sample</button>
                {bulk && (
                  <button
                    type="button"
                    onClick={() => setBulk('')}
                    className="text-red-500 hover:text-red-600 text-xs px-1"
                  >Clear</button>
                )}
              </div>
            </div>
            <Textarea
              rows={3}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={'Paste accounts here (one per line)...\nSupported: login | password, login:password, login----password'}
              className="font-mono text-xs w-full"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={bulk.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                {bulk.trim() ? `✓ ${bulk.trim().split('\n').filter(Boolean).length} accounts detected` : '0 accounts entered'}
              </span>
              <Button onClick={importBulk} disabled={busy || !bulk.trim()} className="shrink-0">
                <span className="flex items-center gap-1"><Upload size={14} /> {busy ? 'Importing…' : 'Import Vault'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!editingRow} onClose={() => setEditingRow(null)} title="Edit delivery item">
        {editingRow && (
          <div className="space-y-3">
            <Field label="Login (email / username)"><Input value={editLogin} onChange={(e) => setEditLogin(e.target.value)} placeholder="Login" /></Field>
            <Field label="Password"><Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Password" /></Field>
            <Field label="Status">
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value as 'AVAILABLE' | 'SOLD')} className="w-full">
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="SOLD">SOLD</option>
              </Select>
            </Field>
            <div className="mt-4 flex gap-2">
              <Button variant="green" onClick={saveEdit} disabled={savingEdit} className="flex-1">{savingEdit ? 'Saving…' : 'Save changes'}</Button>
              <Button variant="outline" onClick={() => setEditingRow(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!deletingId}
        text="Delete this delivery item?"
        onYes={doDelete}
        onNo={() => setDeletingId(null)}
      />
    </div>
  );
}

function TierEditor({
  tiers,
  onChange,
  basePrice,
}: {
  tiers: Array<{ minQty: number; unitPrice: number }>;
  onChange: (tiers: Array<{ minQty: number; unitPrice: number }>) => void;
  basePrice?: number;
}) {
  const [minQty, setMinQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const addTier = () => {
    const q = parseInt(minQty, 10);
    const p = parseFloat(unitPrice);
    if (isNaN(q) || q < 1) {
      toast('Min quantity must be 1 or higher');
      return;
    }
    if (isNaN(p) || p <= 0) {
      toast('Unit price must be greater than 0');
      return;
    }
    const filtered = tiers.filter((t) => t.minQty !== q);
    const updated = [...filtered, { minQty: q, unitPrice: p }].sort((a, b) => a.minQty - b.minQty);
    onChange(updated);
    setMinQty('');
    setUnitPrice('');
  };

  const removeTier = (qty: number) => {
    onChange(tiers.filter((t) => t.minQty !== qty));
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            🏷️ Bulk Pricing Tiers (Volume Discounts)
          </span>
          <p className="text-[11px] text-slate-500">
            Customers buying at or above the min quantity automatically get this discounted rate.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">
          {tiers.length} {tiers.length === 1 ? 'tier' : 'tiers'}
        </span>
      </div>

      {tiers.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {tiers.map((t) => {
            const savingsPct = basePrice && basePrice > 0 ? Math.round((1 - t.unitPrice / basePrice) * 100) : null;
            return (
              <div
                key={t.minQty}
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-medium border border-slate-200/80 shadow-sm dark:border-slate-800 dark:bg-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Buy {t.minQty}+ pcs
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    ${t.unitPrice.toFixed(2)}/pc
                  </span>
                  {savingsPct !== null && savingsPct > 0 && (
                    <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Save {savingsPct}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeTier(t.minQty)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  title="Remove tier"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1.5">
        <div className="flex-1">
          <Input
            type="number"
            min="1"
            placeholder="Min Qty (e.g. 3)"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            className="!py-1.5 text-xs"
          />
        </div>
        <div className="flex-1">
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Unit Price USDT"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="!py-1.5 text-xs"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addTier}
          className="!py-1.5 !px-3 text-xs shrink-0 font-semibold"
        >
          <Plus size={13} className="mr-1" /> Add Tier
        </Button>
      </div>
    </div>
  );
}

// Admin Products — reads LIVE TZ Store data (Next.js :3000 /api/admin/products).
export default function Products() {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<TzProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  // edit-form fields (TZ Store live data)
  const [eTitle, setETitle] = useState('');
  const [eCat, setECat] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [ePhoto, setEPhoto] = useState('');
  const [ePreview, setEPreview] = useState('');
  const [eTiers, setETiers] = useState<Array<{ minQty: number; unitPrice: number }>>([]);
  const [eUploading, setEUploading] = useState(false);
  const [eSaving, setESaving] = useState(false);
  const [eSortOrder, setESortOrder] = useState('1');
  const [editError, setEditError] = useState('');
  const editFileRef = useRef<HTMLInputElement>(null);
  const [nTitle, setNTitle] = useState('');
  const [nCat, setNCat] = useState('');
  const [nPrice, setNPrice] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nStock, setNStock] = useState('0');
  const [nPhoto, setNPhoto] = useState(''); // uploaded /uploads/... url
  const [nPreview, setNPreview] = useState(''); // local preview before upload
  const [nTiers, setNTiers] = useState<Array<{ minQty: number; unitPrice: number }>>([]);
  const [nSortOrder, setNSortOrder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const cats = useQuery({ queryKey: ['tz-cats'], queryFn: tzGetCategories });
  const list = useQuery({ queryKey: ['tz-products'], queryFn: tzGetProducts });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const catName = useMemo(() => Object.fromEntries(((cats.data?.categories ?? []) as { slug: string; name: string }[]).map((c) => [c.slug, c.name])), [cats.data]);
  const rows = useMemo(() => {
    const items = (list.data?.products ?? []).map((p) => ({ ...p, categoryName: catName[p.categorySlug] ?? p.categorySlug }));
    const q = search.trim().toLowerCase();
    return items
      .filter((p) =>
        (!cat || p.categorySlug === cat) &&
        (!q || p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)))
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }, [list.data, catName, search, cat]);

  async function moveProduct(productId: string, dir: -1 | 1) {
    const ordered = rows.map((r) => r.id);
    const i = ordered.indexOf(productId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    try {
      await tzReorderProducts(ordered);
      toast('Product order updated');
      list.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'reorder failed');
    }
  }

  async function updateProductSerial(productId: string, val: number) {
    if (isNaN(val) || val < 1) return;
    try {
      await tzUpdateProduct(productId, { sortOrder: val });
      toast(`Priority set to #${val}`);
      list.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'update failed');
    }
  }

  const columns = useMemo(() => [
    col.display({
      id: 'serial',
      header: '# Priority',
      cell: (c) => {
        const p = c.row.original;
        const currentSerial = p.sortOrder ?? (c.row.index + 1);
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              defaultValue={currentSerial}
              key={`serial-${p.id}-${currentSerial}`}
              onBlur={(e) => {
                const val = Number(e.target.value);
                if (val && val !== currentSerial) updateProductSerial(p.id, val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              title="Type priority number & press Enter"
              className="h-7 w-12 rounded-lg border border-slate-200 bg-slate-50 px-1 text-center text-xs font-black text-blue-600 shadow-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
            />
            <div className="flex flex-col">
              <button
                type="button"
                title="Move up (higher priority)"
                onClick={() => moveProduct(p.id, -1)}
                disabled={c.row.index === 0}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 dark:hover:bg-slate-800"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                title="Move down (lower priority)"
                onClick={() => moveProduct(p.id, 1)}
                disabled={c.row.index === rows.length - 1}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20 dark:hover:bg-slate-800"
              >
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        );
      },
    }),
    col.accessor('title', { header: 'Product' }),
    col.accessor('categoryName', { header: 'Category' }),
    col.accessor('priceUsdt', { header: 'Price', cell: (c) => `$${Number(c.getValue()).toFixed(2)}` }),
    col.accessor('stock', { header: 'Stock', cell: (c) => <Badge tone={Number(c.getValue()) > 5 ? 'green' : 'amber'}>{String(c.getValue())}</Badge> }),
    col.accessor('status', { header: 'Status', cell: (c) => <Badge tone={c.getValue() === 'ACTIVE' ? 'green' : 'red'}>{String(c.getValue())}</Badge> }),
    col.display({ id: 'actions', header: '', cell: (c) => {
      const p = c.row.original;
      const open = expandedId === p.id;
      const toggle = () => setExpandedId((v) => (v === p.id ? null : p.id));
      return (
        <span className="flex items-center justify-end gap-1.5">
          <Button variant="outline" onClick={() => openEdit(p)}>
            <span className="flex items-center gap-1"><Pencil size={14} /> Edit</span>
          </Button>
          <Button variant={open ? 'primary' : 'outline'} onClick={toggle}>
            <span className="flex items-center gap-1 text-blue-600"><Package size={14} /> Delivery</span>
          </Button>
          <button onClick={toggle} aria-label="Toggle delivery" className="rounded-[10px] border border-slate-300 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </span>
      );
    } }),
  ], [expandedId, rows]);

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel() });

  function openEdit(p: TzProduct) {
    setEditing(p);
    setETitle(p.title); setECat(p.categorySlug); setEPrice(String(p.priceUsdt)); setEDesc(p.desc ?? '');
    setESortOrder(String(p.sortOrder ?? 1));
    setEPhoto(p.logo ?? ''); setEPreview(p.logo ?? '');
    setETiers(p.tiers ? JSON.parse(JSON.stringify(p.tiers)) : []);
    setEditError(''); setEUploading(false); setESaving(false);
    if (editFileRef.current) editFileRef.current.value = '';
  }

  async function onEditPhotoFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file'); return; }
    if (f.size > 2 * 1024 * 1024) { toast('Image must be under 2MB'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(f);
    });
    setEPreview(dataUrl);
    setEUploading(true);
    try {
      const j = await tzUploadPhoto(f.name, dataUrl);
      setEPhoto(j.url);
      toast('Photo uploaded');
    } catch (e) { toast(e instanceof Error ? e.message : 'upload failed'); }
    finally { setEUploading(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    setEditError('');
    if (!eTitle.trim() || !eCat || !Number(ePrice)) { setEditError('Title, category and price are required'); return; }
    setESaving(true);
    try {
      await tzUpdateProduct(editing.id, {
        title: eTitle.trim(),
        categorySlug: eCat,
        priceUsdt: Number(ePrice),
        desc: eDesc,
        contents: eDesc,
        logo: ePhoto || undefined,
        tiers: eTiers,
        sortOrder: Number(eSortOrder) || undefined,
      });
      toast('Saved to TZ Store'); setEditing(null); list.refetch();
    } catch (e) { setEditError(e instanceof Error ? e.message : 'save failed'); }
    finally { setESaving(false); }
  }

  async function deleteCurrentProduct() {
    if (!editing) return;
    try {
      await tzDeleteProduct(editing.id);
      toast('Product deleted');
      setEditing(null);
      setDeletingProduct(false);
      list.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'delete failed');
    }
  }


  async function onPhotoFile(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('Please choose an image file'); return; }
    if (f.size > 2 * 1024 * 1024) { toast('Image must be under 2MB'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(f);
    });
    setNPreview(dataUrl);
    setUploading(true);
    try {
      const j = await tzUploadPhoto(f.name, dataUrl);
      setNPhoto(j.url);
      toast('Photo uploaded');
    } catch (e) { toast(e instanceof Error ? e.message : 'upload failed'); setNPreview(''); }
    finally { setUploading(false); }
  }

  function resetCreate() {
    setCreating(false); setNTitle(''); setNCat(''); setNPrice(''); setNDesc(''); setNStock('0');
    setNPhoto(''); setNPreview(''); setNTiers([]); setNSortOrder(''); setSaving(false); setFormError('');
    setShowNewCat(false); setNewCatName(''); setCreatingCat(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function createCategoryInline() {
    const name = newCatName.trim();
    if (name.length < 2) { toast('Type a category name (2+ chars)'); return; }
    setCreatingCat(true);
    try {
      const j = await tzCreateCategory(name);
      await cats.refetch();
      setNCat(j.category.slug);
      setShowNewCat(false); setNewCatName('');
      toast(`Category "${j.category.name}" added`);
    } catch (e) { toast(e instanceof Error ? e.message : 'category create failed'); }
    finally { setCreatingCat(false); }
  }

  async function createProduct() {
    // If user typed a new-category name but never pressed Add, create it now automatically.
    let slug = nCat;
    setFormError('');
    if (!slug && newCatName.trim().length >= 2) {
      try {
        const j = await tzCreateCategory(newCatName.trim());
        await cats.refetch();
        slug = j.category.slug;
        setNCat(slug);
        setShowNewCat(false); setNewCatName('');
        toast(`Category "${j.category.name}" added`);
      } catch (e) { setFormError(e instanceof Error ? e.message : 'category create failed'); return; }
    }
    const missing: string[] = [];
    if (!nTitle.trim()) missing.push('title');
    if (!slug) missing.push('category (pick one, or type a new name and press Add)');
    if (!Number(nPrice)) missing.push('price (must be over 0)');
    if (missing.length) { setFormError(`Missing: ${missing.join(' · ')}`); toast('Title, category and price are required'); return; }
    setSaving(true);
    try {
      await tzCreateProduct({
        title: nTitle.trim(),
        categorySlug: slug,
        priceUsdt: Number(nPrice),
        desc: nDesc,
        contents: nDesc,
        stock: Number(nStock) || 0,
        logo: nPhoto || undefined,
        tiers: nTiers,
        sortOrder: nSortOrder ? Number(nSortOrder) : undefined,
      });
      toast('Product added to TZ Store');
      resetCreate();
      cats.refetch(); list.refetch();
    } catch (e) { toast(e instanceof Error ? e.message : 'create failed'); }
    finally { setSaving(false); }
  }

  function csv() {
    const csvText = ['id,title,category,price,stock,status', ...rows.map((r) => `"${r.id}","${r.title.replace(/"/g, '""')}","${r.categoryName}",${r.priceUsdt},${r.stock},${r.status}`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
    a.download = 'tz-products.csv'; a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-extrabold"><Package size={20} /> Category Product</h1>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">TZ Store live</span>
        <Input placeholder="Search title or id…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-52" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>{((cats.data?.categories ?? []) as { slug: string; name: string }[]).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={csv}>CSV export</Button>
        <Button variant="green" onClick={() => { setNCat(cat || ''); setFormError(''); setCreating(true); }}><span className="flex items-center gap-1"><Plus size={15} /> New product</span></Button>
      </div>
      <Card>
        {list.isLoading ? <Skeleton className="h-64" /> : rows.length === 0 ? <Empty text={list.error ? `TZ Store unreachable: ${(list.error as Error).message} — is :3000 running?` : 'No products in TZ Store'} /> : (
          <>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="border-b p-2 text-left text-xs uppercase text-slate-500">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
              <tbody>{table.getRowModel().rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b last:border-0 dark:border-slate-800">{r.getVisibleCells().map((c) => <td key={c.id} className="p-2">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>
                  {expandedId === (r.original as TzProduct).id && (
                    <tr key={`${r.id}-delivery`}>
                      <td colSpan={table.getAllColumns().length} className="bg-slate-50 p-3 dark:bg-slate-800/40">
                        <DeliveryReadyTable
                          product={r.original as TzProduct}
                          onCollapse={() => setExpandedId(null)}
                          onChanged={() => list.refetch()}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table></div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <Button variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft size={16} /></Button>
              <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
              <Button variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight size={16} /></Button>
            </div>
          </>
        )}
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit — ${editing.title}` : ''} wide>
        {editing && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">ID <code>{editing.id}</code> · Stock <b>{editing.stock}</b></p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => editFileRef.current?.click()} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800">
                {ePreview ? <img src={ePreview.startsWith('data:') ? ePreview : tzLogoUrl(ePreview)} alt="preview" className="h-full w-full object-cover" /> : <ImagePlus size={26} className="text-slate-400" />}
              </button>
              <div className="text-sm">
                <div className="font-semibold">Product photo</div>
                <p className="text-xs text-slate-500">PNG/JPG/WebP under 2MB. Click the box or drag a file.</p>
                <input ref={editFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => onEditPhotoFile(e.target.files?.[0])} />
                <div className="mt-1 flex gap-2">
                  <Button variant="outline" onClick={() => editFileRef.current?.click()} disabled={eUploading}>{eUploading ? 'Uploading…' : 'Change photo'}</Button>
                  {ePreview && <button onClick={() => { setEPreview(''); setEPhoto(''); if (editFileRef.current) editFileRef.current.value = ''; }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><X size={14} /> Remove</button>}
                </div>
              </div>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onEditPhotoFile(e.dataTransfer.files?.[0]); }}
              className="rounded-xl bg-slate-50 p-2 text-center text-[11px] text-slate-400 dark:bg-slate-800/60">
              Drop an image anywhere on this box to upload instantly
            </div>
            <Field label="Title"><Input value={eTitle} onChange={(e) => setETitle(e.target.value)} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Field label="Category"><Select value={eCat} onChange={(e) => setECat(e.target.value)}>
                <option value="">Select category…</option>{((cats.data?.categories ?? []) as { slug: string; name: string }[]).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Select></Field>
              <Field label="Price USDT"><Input type="number" step="0.01" min="0" value={ePrice} onChange={(e) => setEPrice(e.target.value)} /></Field>
              <Field label="Priority / Serial #"><Input type="number" min="1" step="1" value={eSortOrder} onChange={(e) => setESortOrder(e.target.value)} placeholder="1" /></Field>
            </div>
            <Field label="Description"><Textarea rows={3} value={eDesc} onChange={(e) => setEDesc(e.target.value)} /></Field>
            <TierEditor tiers={eTiers} onChange={setETiers} basePrice={Number(ePrice) || undefined} />
            {editError && <p className="rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">{editError}</p>}
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={eSaving || eUploading} className="flex-1">{eSaving ? 'Saving…' : 'Save to TZ Store'}</Button>
              <Button variant="danger" onClick={() => setDeletingProduct(true)} className="shrink-0"><span className="flex items-center gap-1"><Trash2 size={14} /> Delete</span></Button>
            </div>
            <hr className="dark:border-slate-800" />
            {editing && <VaultSection productId={editing.id} stock={editing.stock} onChanged={() => list.refetch()} />}
          </div>
        )}
      </Modal>
      <Confirm
        open={deletingProduct}
        text={`Are you sure you want to delete product "${editing?.title}"?`}
        onYes={deleteCurrentProduct}
        onNo={() => setDeletingProduct(false)}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="New product — TZ Store">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800">
              {nPreview ? <img src={nPreview} alt="preview" className="h-full w-full object-cover" /> : <ImagePlus size={26} className="text-slate-400" />}
            </button>
            <div className="text-sm">
              <div className="font-semibold">Product photo</div>
              <p className="text-xs text-slate-500">PNG/JPG/WebP under 2MB. Click the box or drag a file.</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => onPhotoFile(e.target.files?.[0])} />
              <div className="mt-1 flex gap-2">
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : nPhoto ? 'Change photo' : 'Add photo'}</Button>
                {nPreview && <button onClick={() => { setNPreview(''); setNPhoto(''); if (fileRef.current) fileRef.current.value = ''; }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><X size={14} /> Remove</button>}
              </div>
            </div>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPhotoFile(e.dataTransfer.files?.[0]); }}
            className="rounded-xl bg-slate-50 p-2 text-center text-[11px] text-slate-400 dark:bg-slate-800/60">
            Drop an image anywhere on this box to upload instantly
          </div>
          <Field label="Title"><Input value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="e.g. Netflix Premium 1M" /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="Category">
              <Select value={nCat} onChange={(e) => setNCat(e.target.value)}>
                <option value="">Select category…</option>{((cats.data?.categories ?? []) as { slug: string; name: string }[]).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </Select>
              {!showNewCat ? (
                <button onClick={() => setShowNewCat(true)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"><Plus size={13} /> New category</button>
              ) : (
                <div className="mt-1 flex gap-1">
                  <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Kiro" className="!py-1.5 text-xs"
                    onKeyDown={(e) => { if (e.key === 'Enter') createCategoryInline(); }} />
                  <Button onClick={createCategoryInline} disabled={creatingCat} className="!px-3 !py-1.5 text-xs">{creatingCat ? '…' : 'Add'}</Button>
                </div>
              )}
            </Field>
            <Field label="Price USDT"><Input type="number" step="0.01" min="0" value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="4.99" /></Field>
            <Field label="Priority / Serial #"><Input type="number" min="1" step="1" value={nSortOrder} onChange={(e) => setNSortOrder(e.target.value)} placeholder="Auto (Next)" /></Field>
          </div>
          <Field label="Description"><Textarea rows={3} value={nDesc} onChange={(e) => setNDesc(e.target.value)} placeholder="What the buyer gets…" /></Field>
          <TierEditor tiers={nTiers} onChange={setNTiers} basePrice={Number(nPrice) || undefined} />
          <Field label="Initial stock"><Input type="number" min="0" value={nStock} onChange={(e) => setNStock(e.target.value)} /></Field>
          {formError && <p className="rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">{formError}</p>}
          <Button variant="green" onClick={createProduct} disabled={saving || uploading} className="w-full">{saving ? 'Saving…' : 'Add product'}</Button>
          <p className="text-center text-xs text-slate-500">Saved to TZ Store live catalog — appears in the storefront and bot instantly.</p>
        </div>
      </Modal>
    </div>
  );
}
