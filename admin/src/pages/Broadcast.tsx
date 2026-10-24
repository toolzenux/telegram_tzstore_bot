import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, del } from '../api';
import { Button, Card, Empty, Input, Select, Skeleton, Textarea, toast } from '../ui';
import { Send, Save, Trash2, Play, Sparkles, CheckCircle2, RefreshCw, AlertCircle, Users } from 'lucide-react';

type Bc = {
  id: string;
  title: string;
  text: string;
  targetType: string;
  sentCount: number;
  status: string;
  createdAt: string;
};

const TEMPLATES = [
  {
    name: '⚡ Flash Sale',
    title: '🔥 FLASH SALE: 20% OFF Everything Today!',
    text: 'Hey there! 🎉\n\nFor the next <b>24 hours</b>, enjoy exclusive discounts across all products.\n\n👉 Open the store now and grab your instant licenses!',
  },
  {
    name: '🎁 Restock Alert',
    title: '📦 New Stock Added to Vault!',
    text: 'Fresh accounts and licenses have just been added to the store vault.\n\n⚡ <b>Instant Delivery Guaranteed</b> — zero wait time!',
  },
  {
    name: '📢 Important Update',
    title: '📢 System Maintenance Completed',
    text: 'All automated payment and delivery systems are fully operational.\n\nThank you for choosing us!',
  },
];

export default function Broadcast() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [segment, setSegment] = useState('all');
  const [lastId, setLastId] = useState<string | null>(null);

  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const list = useQuery({
    queryKey: ['bc'],
    queryFn: () => get('/api/broadcasts') as Promise<Bc[]>,
    refetchInterval: 8000,
  });

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setNotice({ text, type });
    if (type === 'success') toast(text);
    setTimeout(() => setNotice(null), 5000);
  };

  // 1. Save draft
  async function handleSaveDraft() {
    if (!text.trim()) {
      showNotice('Please enter message text before saving', 'error');
      return;
    }
    setSavingDraft(true);
    setNotice(null);
    try {
      const b = (await post('/api/broadcasts', {
        title: title.trim() || 'Announcement',
        text: text.trim(),
        targetType: segment === 'all' ? 'ALL' : 'SEGMENT',
      })) as Bc;
      setLastId(b.id);
      showNotice('✅ Draft saved successfully!');
      list.refetch();
    } catch (e: any) {
      showNotice(`❌ ${e instanceof Error ? e.message : 'Failed to save draft'}`, 'error');
    } finally {
      setSavingDraft(false);
    }
  }

  // 2. Send broadcast (creates if not already created, then sends to Telegram users)
  async function handleSend(broadcastIdToSend?: string) {
    let targetId = broadcastIdToSend || lastId;

    // If sending from composer and no broadcast ID yet, create it first
    if (!targetId) {
      if (!text.trim()) {
        showNotice('Please enter message text to broadcast', 'error');
        return;
      }
      setSending(true);
      setNotice(null);
      try {
        const created = (await post('/api/broadcasts', {
          title: title.trim() || 'Announcement',
          text: text.trim(),
          targetType: segment === 'all' ? 'ALL' : 'SEGMENT',
        })) as Bc;
        targetId = created.id;
        setLastId(created.id);
      } catch (err: any) {
        showNotice(`❌ ${err instanceof Error ? err.message : 'Failed to initialize broadcast'}`, 'error');
        setSending(false);
        return;
      }
    }

    setSending(true);
    setSendingId(targetId);
    setNotice(null);
    try {
      const res = (await post(`/api/broadcasts/${targetId}/send`, { segment })) as {
        ok: boolean;
        sentCount: number;
        total: number;
      };

      showNotice(`🎉 Broadcast delivered to ${res.sentCount || 0} user${res.sentCount === 1 ? '' : 's'}!`);
      // Clear composer if current broadcast was sent
      if (targetId === lastId || !broadcastIdToSend) {
        setTitle('');
        setText('');
        setLastId(null);
      }
      list.refetch();
    } catch (e: any) {
      showNotice(`❌ Send failed: ${e instanceof Error ? e.message : 'Server error'}`, 'error');
    } finally {
      setSending(false);
      setSendingId(null);
    }
  }

  // 3. Delete broadcast
  async function handleDelete(id: string) {
    try {
      await del(`/api/broadcasts/${id}`);
      showNotice('Broadcast deleted');
      if (lastId === id) setLastId(null);
      list.refetch();
    } catch (e: any) {
      showNotice(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* LEFT: Composer & History */}
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-base flex items-center gap-2">
              <Send size={18} className="text-blue-600 dark:text-blue-400" />
              <span>Compose Telegram Broadcast</span>
            </h2>
            <span className="text-xs text-slate-500 font-medium">Delivers directly to bot subscribers</span>
          </div>

          {/* Quick Templates */}
          <div className="mb-3 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">⚡ Quick Templates</span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    setTitle(tpl.title);
                    setText(tpl.text);
                    setLastId(null);
                  }}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 transition active:scale-95"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                Broadcast Title / Header
              </label>
              <Input
                placeholder="e.g. 🔥 Weekend Promo or New Stock Alert"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                Message Body <span className="font-normal text-slate-400">(HTML supported: &lt;b&gt;, &lt;i&gt;, &lt;code&gt;)</span>
              </label>
              <Textarea
                rows={5}
                placeholder="Type your message text here…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Recipient Audience
                </label>
                <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
                  <option value="all">Target: ALL Users</option>
                  <option value="active7d">Active Last 7 Days</option>
                  <option value="buyers">Paid Buyers Only</option>
                  <option value="neverBought">Subscribed (No Purchases)</option>
                </Select>
              </div>
            </div>

            {/* Action Buttons & Notice */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              {/* Save Draft Button */}
              <Button
                onClick={handleSaveDraft}
                disabled={savingDraft || sending}
                variant="outline"
                className="flex items-center gap-1.5"
              >
                {savingDraft ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Saving Draft…</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save draft</span>
                  </>
                )}
              </Button>

              {/* Send All Button */}
              <Button
                variant="green"
                onClick={() => handleSend()}
                disabled={sending || savingDraft || !text.trim()}
                className="flex items-center gap-1.5"
              >
                {sending && !sendingId ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Sending to Telegram…</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send {segment === 'all' ? 'all' : segment}</span>
                  </>
                )}
              </Button>

              {notice && (
                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl animate-in fade-in duration-150 ${
                    notice.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {notice.text}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* History Table */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Users size={16} className="text-slate-500" />
              <span>Broadcast History</span>
            </h3>
            <button
              onClick={() => list.refetch()}
              className="text-xs text-blue-600 hover:text-blue-500 font-semibold"
            >
              Refresh
            </button>
          </div>

          {list.isLoading ? (
            <Skeleton className="h-24" />
          ) : !list.data?.length ? (
            <Empty text="No broadcasts yet. Compose a message above to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-left">
                    <th className="pb-2 font-semibold">Title & Status</th>
                    <th className="pb-2 text-right font-semibold">Delivered</th>
                    <th className="pb-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.data.map((b) => {
                    const isDraft = b.status === 'DRAFT';
                    const isDone = b.status === 'DONE';
                    const isSending = b.status === 'SENDING';
                    const rowSending = sending && sendingId === b.id;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-2.5 pr-2">
                          <div className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[240px]">
                            {b.title}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isDone
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : isSending
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 animate-pulse'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              }`}
                            >
                              {b.status}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(b.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-bold font-mono text-slate-700 dark:text-slate-200">
                              {b.sentCount}
                            </span>
                            <span className="text-slate-400 text-[10px]">sent</span>
                          </div>
                        </td>

                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => handleSend(b.id)}
                                disabled={sending}
                                className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-1 text-[11px] font-bold transition flex items-center gap-1"
                                title="Send draft now"
                              >
                                {rowSending ? (
                                  <RefreshCw size={12} className="animate-spin" />
                                ) : (
                                  <Play size={12} fill="currentColor" />
                                )}
                                <span>Send</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(b.id)}
                              className="rounded-lg p-1 text-slate-400 hover:text-rose-500 transition"
                              title="Delete broadcast"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* RIGHT: Live Telegram Chat Bubble Simulation */}
      <div>
        <Card className="sticky top-20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm flex items-center gap-1.5">
              <Sparkles size={16} className="text-blue-500" />
              <span>Live Telegram Preview</span>
            </h2>
            <span className="text-[11px] text-slate-400">Shows exact formatting</span>
          </div>

          <div className="mx-auto max-w-sm rounded-2xl bg-[#71a364]/20 p-4 shadow-inner dark:bg-black/30 border border-black/5 dark:border-white/5">
            <div className="rounded-2xl bg-[#E8F3E8] dark:bg-[#1a3a2a] p-3.5 shadow-md space-y-1.5 border border-black/5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                <span>📢</span>
                <span className="truncate">{title.trim() || 'Announcement Title'}</span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                {text.trim() || 'Your broadcast message preview will render here exactly as bot subscribers will see it in Telegram…'}
              </p>
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <CheckCircle2 size={11} className="text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-500 space-y-1">
            <div className="font-bold text-slate-700 dark:text-slate-300">💡 Formatting Tips:</div>
            <div>• <code>&lt;b&gt;bold text&lt;/b&gt;</code> for bold</div>
            <div>• <code>&lt;i&gt;italic text&lt;/i&gt;</code> for italics</div>
            <div>• <code>&lt;code&gt;promo-code&lt;/code&gt;</code> for tap-to-copy code</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
