import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ReceiptText, CreditCard, Settings,
  RefreshCw, CheckCircle2, AlertCircle, Clock, ExternalLink,
  Search, Plus, ArrowUpRight, DollarSign, UserCheck, Shield,
  Sun, Moon, Monitor, LogOut, Send, Check, Store, ChevronRight, ChevronLeft,
  Copy, Sparkles, Smartphone, Zap, TrendingUp, X, Flame, Gift,
  Layers, Activity, CheckCircle, Wifi, Battery, MessageSquare,
  Lock, KeyRound, ChevronDown, ChevronUp, Bell, Globe, Pencil,
  ImagePlus, Trash2, Upload, Download, Eye, EyeOff, Tags,
  ArrowUp, ArrowDown, Users as UsersIcon, FileSpreadsheet,
} from 'lucide-react';
import { get, post, api } from '../api';
import { useStore } from '../store';
import {
  tzGetProducts, tzGetCategories, tzCreateProduct, tzUpdateProduct,
  tzDeleteProduct, tzUploadPhoto, tzLogoUrl, tzVaultList, tzVaultAdd,
  tzVaultImport, tzVaultDelete, tzVaultUpdate, tzCreateCategory,
  tzDeleteCategory, tzReorderCategories, tzReorderProducts, tzAddStock, tzClearOrders, tzRefundOrder,
  type TzProduct, type TzCategory, type VaultRow,
} from '../tzstore';

// Telegram WebApp Haptic Feedback
function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light') {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
      if (type === 'success' || type === 'warning') {
        tg.HapticFeedback.notificationOccurred(type);
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    }
  } catch {}
}

function MobileTierEditor({
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
    if (isNaN(q) || q < 1) return;
    if (isNaN(p) || p <= 0) return;
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
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
          <span>🏷️ Bulk Pricing Tiers</span>
        </label>
        <span className="text-[10px] text-blue-400 font-mono">
          {tiers.length} active
        </span>
      </div>

      {tiers.length > 0 && (
        <div className="space-y-1.5">
          {tiers.map((t) => {
            const savings = basePrice && basePrice > 0 ? Math.round((1 - t.unitPrice / basePrice) * 100) : null;
            return (
              <div
                key={t.minQty}
                className="flex items-center justify-between rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-xs border border-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Buy {t.minQty}+ pcs</span>
                  <span className="font-mono text-emerald-400 font-bold">${t.unitPrice.toFixed(2)}</span>
                  {savings !== null && savings > 0 && (
                    <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-bold text-emerald-300">
                      −{savings}%
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeTier(t.minQty)}
                  className="p-1 text-slate-400 hover:text-rose-400"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <input
          type="number"
          min="1"
          placeholder="Min Qty"
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          className="w-20 rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Price USDT"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="flex-1 rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-xs text-white"
        />
        <button
          type="button"
          onClick={addTier}
          className="rounded-lg bg-blue-600/30 border border-blue-500/30 px-2.5 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-600/50"
        >
          + Add
        </button>
      </div>

      <div className="flex items-center justify-between pt-1 text-[10px]">
        <button
          type="button"
          onClick={() => {
            if (!basePrice || basePrice <= 0) return;
            const t3 = Math.max(0.01, Math.round(basePrice * 0.95 * 100) / 100);
            const t5 = Math.max(0.01, Math.round(basePrice * 0.90 * 100) / 100);
            const t10 = Math.max(0.01, Math.round(basePrice * 0.85 * 100) / 100);
            onChange([
              { minQty: 3, unitPrice: t3 },
              { minQty: 5, unitPrice: t5 },
              { minQty: 10, unitPrice: t10 },
            ]);
          }}
          className="text-blue-400 hover:text-blue-300 font-semibold"
        >
          ⚡ Auto-Generate Tiers (3+, 5+, 10+)
        </button>
        {tiers.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-slate-400 hover:text-rose-400"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default function MobileAdminApp() {
  const { admin, theme, toggleTheme } = useStore();
  const nav = useNavigate();
  const qc = useQueryClient();

  // Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'categories' | 'orders' | 'deposits' | 'users' | 'settings' | 'tools'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams(window.location.search).get('tab');
        if (q && ['overview', 'products', 'categories', 'orders', 'deposits', 'users', 'settings', 'tools'].includes(q)) {
          return q as any;
        }
      } catch {}
    }
    return 'overview';
  });
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'PENDING' | 'DELIVERED'>('ALL');
  const [productSearch, setProductSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Broadcast State
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);

  // ================= MODAL STATES =================
  // 1. Create Product Modal
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nCat, setNCat] = useState('');
  const [nPrice, setNPrice] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nContents, setNContents] = useState('');
  const [nDeliveryMode, setNDeliveryMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [nAccounts, setNAccounts] = useState('');
  const [nStock, setNStock] = useState('0');
  const [nPhoto, setNPhoto] = useState('');
  const [nPreview, setNPreview] = useState('');
  const [nTiers, setNTiers] = useState<Array<{ minQty: number; unitPrice: number }>>([]);
  const [nSortOrder, setNSortOrder] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState('');
  const [inlineCatName, setInlineCatName] = useState('');
  const [showInlineCat, setShowInlineCat] = useState(false);
  const createPhotoFileRef = useRef<HTMLInputElement>(null);

  // 2. Edit Product Modal
  const [editingProduct, setEditingProduct] = useState<TzProduct | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eCat, setECat] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [ePhoto, setEPhoto] = useState('');
  const [ePreview, setEPreview] = useState('');
  const [eTiers, setETiers] = useState<Array<{ minQty: number; unitPrice: number }>>([]);
  const [eSortOrder, setESortOrder] = useState('1');
  const [eUploading, setEUploading] = useState(false);
  const [eSaving, setESaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const editPhotoFileRef = useRef<HTMLInputElement>(null);

  // 3. Delivery Ready Vault Modal & Inline Expandable Accordion
  const [deliveryProduct, setDeliveryProduct] = useState<TzProduct | null>(null);
  const [expandedDeliveryProductId, setExpandedDeliveryProductId] = useState<string | null>(null);
  const [vaultLogin, setVaultLogin] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultBulk, setVaultBulk] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [revealedVault, setRevealedVault] = useState<Record<string, boolean>>({});
  // Delivery Vault UI Optimization States (Telegram Mobile First)
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultFilter, setVaultFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('ALL');
  const [vaultViewMode, setVaultViewMode] = useState<'cards' | 'table'>('cards');
  const [vaultAddTab, setVaultAddTab] = useState<'single' | 'bulk'>('single');

  // Vault Row Edit Modal & Delete Confirm States (100% Desktop Parity)
  const [editingVaultRow, setEditingVaultRow] = useState<VaultRow | null>(null);
  const [editVaultLogin, setEditVaultLogin] = useState('');
  const [editVaultPassword, setEditVaultPassword] = useState('');
  const [editVaultStatus, setEditVaultStatus] = useState<'AVAILABLE' | 'SOLD'>('AVAILABLE');
  const [savingVaultEdit, setSavingVaultEdit] = useState(false);
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);

  // Products List Pagination (Desktop Parity: < Page X/Y >)
  const [productPage, setProductPage] = useState(1);
  const PRODUCTS_PER_PAGE = 8;

  // 4. Quick Restock Counter Modal
  const [restockProduct, setRestockProduct] = useState<TzProduct | null>(null);
  const [restockQty, setRestockQty] = useState(5);
  const [isRestocking, setIsRestocking] = useState(false);

  // 5. Create Category Modal
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [catNameInput, setCatNameInput] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // 6. User Profile Balance Adjustment
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustingBalance, setAdjustingBalance] = useState(false);

  // 7. Settings / Binance Test & Branding
  const [testingBinance, setTestingBinance] = useState(false);
  const [binanceResult, setBinanceResult] = useState<any>(null);
  const [changePwd, setChangePwd] = useState({ old: '', next: '' });
  const [savingPwd, setSavingPwd] = useState(false);
  const [mobileStoreName, setMobileStoreName] = useState('');
  const [mobileSupportUrl, setMobileSupportUrl] = useState('');
  const [mobileChannelUrl, setMobileChannelUrl] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);

  // Expanded deliveries in order card
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Telegram Mini App initial lifecycle
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready?.();
      tg.expand?.();
      tg.enableClosingConfirmation?.();
      try {
        if (theme === 'dark') {
          tg.setHeaderColor?.('#090d16');
          tg.setBackgroundColor?.('#090d16');
        } else {
          tg.setHeaderColor?.('#1e293b');
          tg.setBackgroundColor?.('#f8fafc');
        }
      } catch {}
    }
  }, [theme]);

  // Flash notification helper
  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setActionNotice({ msg, type });
    haptic(type === 'error' ? 'warning' : 'success');
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Copy helper
  const copyText = (text: string, label = 'Copied') => {
    navigator.clipboard?.writeText(text);
    setCopiedId(text);
    notify(`${label} to clipboard!`, 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ================= QUERIES =================
  const { data: dashboard, refetch: refetchDash, isRefetching: dashRefetching } = useQuery<any>({
    queryKey: ['admin-mobile-dashboard'],
    queryFn: () => get('/api/dashboard?days=30'),
    refetchInterval: 15000,
  });

  const { data: ordersData, refetch: refetchOrders, isRefetching: ordersRefetching } = useQuery<any>({
    queryKey: ['admin-mobile-orders'],
    queryFn: () => get('/api/admin/orders'),
    refetchInterval: 15000,
  });

  const { data: productsData, refetch: refetchProds, isRefetching: prodsRefetching } = useQuery<any>({
    queryKey: ['admin-mobile-products'],
    queryFn: tzGetProducts,
  });

  const { data: catsData, refetch: refetchCats } = useQuery<any>({
    queryKey: ['admin-mobile-categories'],
    queryFn: tzGetCategories,
  });

  const { data: usersData, refetch: refetchUsers } = useQuery<any>({
    queryKey: ['admin-mobile-users', userSearch],
    queryFn: () => get(`/api/users?${new URLSearchParams(userSearch ? { search: userSearch } : {})}`),
  });

  const { data: userProfile, refetch: refetchUserProfile } = useQuery<any>({
    queryKey: ['admin-mobile-user-profile', selectedUserId],
    queryFn: () => get(`/api/users/${selectedUserId}`),
    enabled: !!selectedUserId,
  });

  const activeVaultProductId = deliveryProduct?.id || expandedDeliveryProductId;
  const { data: vaultData, refetch: refetchVault, isLoading: vaultLoading } = useQuery<any>({
    queryKey: ['admin-mobile-vault', activeVaultProductId],
    queryFn: () => tzVaultList(activeVaultProductId!),
    enabled: !!activeVaultProductId,
  });

  const { data: settingsData, refetch: refetchSettings } = useQuery<any>({
    queryKey: ['admin-mobile-settings'],
    queryFn: () => get('/api/settings'),
  });

  useEffect(() => {
    if (settingsData) {
      if (settingsData.storeName !== undefined) setMobileStoreName(String(settingsData.storeName || ''));
      if (settingsData.supportUrl !== undefined) setMobileSupportUrl(String(settingsData.supportUrl || ''));
      if (settingsData.channelUrl !== undefined) setMobileChannelUrl(String(settingsData.channelUrl || ''));
    }
  }, [settingsData]);

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ key: 'storeName', value: mobileStoreName.trim() }) });
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ key: 'supportUrl', value: mobileSupportUrl.trim() }) });
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ key: 'channelUrl', value: mobileChannelUrl.trim() }) });
      notify('Store profile and name updated successfully!', 'success');
      window.dispatchEvent(new CustomEvent('tz:storeNameChanged', { detail: { storeName: mobileStoreName.trim() } }));
      refetchSettings();
    } catch (e: any) {
      notify(e.message || 'Failed to save settings', 'error');
    } finally {
      setSavingBranding(false);
    }
  };

  // Fulfill order mutation
  const fulfillMutation = useMutation({
    mutationFn: (orderId: string) => post('/api/admin/orders/fulfill', { orderId }),
    onSuccess: (_, orderId) => {
      notify(`Order ${orderId.slice(-6)} fulfilled & delivered!`, 'success');
      qc.invalidateQueries({ queryKey: ['admin-mobile-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-mobile-dashboard'] });
    },
    onError: (err: any) => {
      notify(err.message || 'Fulfillment failed', 'error');
    },
  });

  // Broadcast mutation
  const broadcastMutation = useMutation({
    mutationFn: (message: string) => post('/api/admin/broadcasts', { message }),
    onSuccess: () => {
      setBroadcastSent(true);
      setBroadcastMsg('');
      notify('Broadcast sent to all subscribers! 🎉', 'success');
      setTimeout(() => setBroadcastSent(false), 4000);
    },
    onError: (err: any) => {
      notify(err.message || 'Broadcast failed', 'error');
    },
  });

  // Photo Upload Helpers
  const handlePhotoUpload = async (file: File | undefined, isEdit = false) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify('Please select an image file', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { notify('Image must be under 2MB', 'error'); return; }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Read failed'));
      r.readAsDataURL(file);
    });

    if (isEdit) {
      setEPreview(dataUrl);
      setEUploading(true);
      try {
        const j = await tzUploadPhoto(file.name, dataUrl);
        setEPhoto(j.url);
        notify('Photo uploaded', 'success');
      } catch (e: any) {
        notify(e.message || 'Upload failed', 'error');
      } finally {
        setEUploading(false);
      }
    } else {
      setNPreview(dataUrl);
      setUploadingPhoto(true);
      try {
        const j = await tzUploadPhoto(file.name, dataUrl);
        setNPhoto(j.url);
        notify('Photo uploaded', 'success');
      } catch (e: any) {
        notify(e.message || 'Upload failed', 'error');
        setNPreview('');
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  // Create Product Submit
  const handleCreateProduct = async () => {
    let slug = nCat;
    setProductFormError('');
    if (!slug && inlineCatName.trim().length >= 2) {
      try {
        const j = await tzCreateCategory(inlineCatName.trim());
        await refetchCats();
        slug = j.category.slug;
        setNCat(slug);
        setShowInlineCat(false);
        setInlineCatName('');
      } catch (e: any) {
        setProductFormError(e.message || 'Failed to create category');
        return;
      }
    }

    if (!nTitle.trim() || !slug || !Number(nPrice)) {
      setProductFormError('Title, category, and price are required');
      notify('Fill all required fields', 'error');
      return;
    }

    setSavingProduct(true);
    try {
      const accountsTrimmed = nAccounts.trim();
      const detectedCount = accountsTrimmed ? accountsTrimmed.split('\n').filter((l) => l.trim().length > 0).length : 0;
      const initialStockVal = detectedCount > 0 ? detectedCount : (Number(nStock) || 0);

      await tzCreateProduct({
        title: nTitle.trim(),
        categorySlug: slug,
        priceUsdt: Number(nPrice),
        desc: nDesc,
        contents: nContents.trim() || nDesc,
        deliveryMode: nDeliveryMode,
        initialAccounts: accountsTrimmed || undefined,
        stock: initialStockVal,
        logo: nPhoto || undefined,
        tiers: nTiers,
        sortOrder: nSortOrder ? Number(nSortOrder) : undefined,
      });
      notify(detectedCount > 0 ? `Product added with ${detectedCount} accounts in vault!` : 'Product added to TZ Store live catalog!', 'success');
      setCreatingProduct(false);
      setNTitle(''); setNCat(''); setNPrice(''); setNDesc(''); setNContents(''); setNDeliveryMode('AUTO'); setNAccounts(''); setNStock('0');
      setNPhoto(''); setNPreview(''); setNTiers([]); setNSortOrder('');
      await refetchProds();
    } catch (e: any) {
      setProductFormError(e.message || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  };

  // Edit Product Submit
  const handleSaveEdit = async () => {
    if (!editingProduct) return;
    setEditError('');
    if (!eTitle.trim() || !eCat || !Number(ePrice)) {
      setEditError('Title, category, and price are required');
      return;
    }
    setESaving(true);
    try {
      await tzUpdateProduct(editingProduct.id, {
        title: eTitle.trim(),
        categorySlug: eCat,
        priceUsdt: Number(ePrice),
        desc: eDesc,
        contents: eDesc,
        logo: ePhoto || undefined,
        tiers: eTiers,
        sortOrder: Number(eSortOrder) || undefined,
      });
      notify('Product updated successfully', 'success');
      setEditingProduct(null);
      await refetchProds();
    } catch (e: any) {
      setEditError(e.message || 'Failed to update');
    } finally {
      setESaving(false);
    }
  };

  // Delete Product Submit
  const handleDeleteProduct = async (id: string) => {
    try {
      await tzDeleteProduct(id);
      notify('Product deleted', 'success');
      setDeletingProductId(null);
      setEditingProduct(null);
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  // Quick Restock Counter
  const handleQuickRestock = async () => {
    if (!restockProduct) return;
    setIsRestocking(true);
    try {
      await tzAddStock(restockProduct.id, restockQty);
      notify(`Added +${restockQty} stock to ${restockProduct.title}`, 'success');
      setRestockProduct(null);
      await refetchProds();
      await refetchDash();
    } catch (e: any) {
      notify(e.message || 'Restock failed', 'error');
    } finally {
      setIsRestocking(false);
    }
  };

  // Vault Management Helpers (Desktop 100% Feature Parity)
  const handleAddVaultItem = async (targetProdId?: string) => {
    const prodId = targetProdId || deliveryProduct?.id || expandedDeliveryProductId;
    if (!prodId || !vaultLogin.trim() || !vaultPassword) {
      notify('Login and password required', 'error');
      return;
    }
    setVaultBusy(true);
    try {
      await tzVaultAdd(prodId, vaultLogin.trim(), vaultPassword);
      notify('Delivery account added', 'success');
      setVaultLogin('');
      setVaultPassword('');
      await refetchVault();
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Failed to add', 'error');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleImportVaultBulk = async (targetProdId?: string) => {
    const prodId = targetProdId || deliveryProduct?.id || expandedDeliveryProductId;
    if (!prodId || !vaultBulk.trim()) return;
    setVaultBusy(true);
    try {
      const j = await tzVaultImport(prodId, vaultBulk.trim());
      notify(`Imported ${j.imported} accounts into vault`, 'success');
      setVaultBulk('');
      await refetchVault();
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Import failed', 'error');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleStartEditVaultRow = (row: VaultRow) => {
    setEditingVaultRow(row);
    setEditVaultLogin(row.login);
    setEditVaultPassword(row.password);
    setEditVaultStatus(row.status);
  };

  const handleSaveVaultEdit = async () => {
    if (!editingVaultRow) return;
    if (!editVaultLogin.trim() || !editVaultPassword) {
      notify('Login and password required', 'error');
      return;
    }
    setSavingVaultEdit(true);
    try {
      await tzVaultUpdate(editingVaultRow.id, {
        login: editVaultLogin.trim(),
        password: editVaultPassword,
        status: editVaultStatus,
      });
      notify('Delivery item updated', 'success');
      setEditingVaultRow(null);
      await refetchVault();
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Update failed', 'error');
    } finally {
      setSavingVaultEdit(false);
    }
  };

  const handleConfirmDeleteVaultItem = async () => {
    if (!deletingVaultId) return;
    try {
      await tzVaultDelete(deletingVaultId);
      notify('Delivery item deleted', 'success');
      setDeletingVaultId(null);
      await refetchVault();
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Delete failed', 'error');
    }
  };

  const handleDeleteVaultItem = async (id: string) => {
    setDeletingVaultId(id);
  };

  const formatVaultDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toISOString().slice(0, 10);
  };

  // Order Management Helpers
  const handleClearAllOrders = async () => {
    if (!confirm('Clear all test/demo orders? This will reset the order book.')) return;
    try {
      await tzClearOrders();
      notify('Order book cleared successfully', 'success');
      await refetchOrders();
      await refetchDash();
    } catch (e: any) {
      notify(e.message || 'Failed to clear orders', 'error');
    }
  };

  const handleRefundOrder = async (orderId: string) => {
    if (!confirm('Refund this order? Stock will be restored to vault automatically.')) return;
    try {
      await tzRefundOrder(orderId);
      notify('Order refunded and inventory restored', 'success');
      await refetchOrders();
      await refetchProds();
      await refetchDash();
    } catch (e: any) {
      notify(e.message || 'Refund failed', 'error');
    }
  };

  // Category Actions
  const handleCreateCategory = async () => {
    if (catNameInput.trim().length < 2) {
      notify('Category name needs 2+ characters', 'error');
      return;
    }
    setSavingCategory(true);
    try {
      const j = await tzCreateCategory(catNameInput.trim());
      notify(`Category "${j.category.name}" added`, 'success');
      setCatNameInput('');
      setCreatingCategory(false);
      await refetchCats();
    } catch (e: any) {
      notify(e.message || 'Failed to create category', 'error');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (slug: string, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
      await tzDeleteCategory(slug);
      notify(`Category "${name}" deleted`, 'success');
      await refetchCats();
      await refetchProds();
    } catch (e: any) {
      notify(e.message || 'Delete failed', 'error');
    }
  };

  const handleMoveCategory = async (slug: string, dir: -1 | 1) => {
    const list = ((catsData?.categories ?? []) as TzCategory[]);
    const slugs = list.map((c) => c.slug);
    const i = slugs.indexOf(slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slugs.length) return;
    [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    try {
      await tzReorderCategories(slugs);
      await refetchCats();
    } catch (e: any) {
      notify(e.message || 'Reorder failed', 'error');
    }
  };

  // CSV Exports
  const exportProductsCsv = () => {
    const prods = (productsData?.products ?? []) as TzProduct[];
    const csvText = [
      'id,title,category,price,stock,status',
      ...prods.map((r) => `"${r.id}","${(r.title || '').replace(/"/g, '""')}","${r.categorySlug}",${r.priceUsdt},${r.stock},${r.status || 'ACTIVE'}`),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
    a.download = 'tz-products.csv';
    a.click();
    notify('Exported tz-products.csv', 'info');
  };

  const exportOrdersCsv = () => {
    const ords = allOrders;
    const csvText = [
      'id,productId,qty,total,userTg,status,createdAt',
      ...ords.map((o: any) => `"${o.id}","${o.productId}",${o.qty},${o.total},"${o.userTg}","${o.status}","${o.createdAt}"`),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
    a.download = 'tz-orders.csv';
    a.click();
    notify('Exported tz-orders.csv', 'info');
  };

  // User Adjustment
  const handleAdjustBalance = async () => {
    if (!selectedUserId || !adjustAmount || !adjustReason) {
      notify('Amount and reason are required', 'error');
      return;
    }
    setAdjustingBalance(true);
    try {
      await post(`/api/users/${selectedUserId}/adjust`, { delta: Number(adjustAmount), reason: adjustReason });
      notify('Wallet balance updated', 'success');
      setAdjustAmount('');
      setAdjustReason('');
      await refetchUserProfile();
      await refetchUsers();
    } catch (e: any) {
      notify(e.message || 'Adjustment failed', 'error');
    } finally {
      setAdjustingBalance(false);
    }
  };

  const handleBanUser = async (banned: boolean) => {
    if (!selectedUserId) return;
    try {
      await post(`/api/users/${selectedUserId}/ban`, { banned });
      notify(banned ? 'User banned' : 'User unbanned', 'success');
      await refetchUserProfile();
      await refetchUsers();
    } catch (e: any) {
      notify(e.message || 'Action failed', 'error');
    }
  };

  // Binance API Test
  const handleTestBinance = async () => {
    setTestingBinance(true);
    setBinanceResult(null);
    try {
      const res = (await get('/api/admin/binance/test')) as any;
      setBinanceResult(res);
      if (res.ok) notify('✅ Binance API is active & connected!', 'success');
      else notify(`❌ ${res.error || 'Connection failed'}`, 'error');
    } catch (e: any) {
      notify('❌ Failed to test Binance API', 'error');
    } finally {
      setTestingBinance(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!changePwd.old || !changePwd.next) {
      notify('Old and new password required', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await post('/api/auth/change-password', { oldPassword: changePwd.old, newPassword: changePwd.next });
      notify('Password changed successfully', 'success');
      setChangePwd({ old: '', next: '' });
    } catch (e: any) {
      notify(e.message || 'Password change failed', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  // Derived arrays
  const allOrders = ordersData?.orders || [];
  const allIntents = ordersData?.intents || [];
  const allProducts = (productsData?.products || []) as TzProduct[];
  const allCategories = (catsData?.categories || []) as TzCategory[];
  const allUsers = (usersData?.items || []);

  const filteredOrders = allOrders.filter((o: any) => {
    if (orderFilter === 'ALL') return true;
    return o.status === orderFilter;
  });

  const filteredProducts = allProducts
    .filter((p: any) => {
      const matchCat = selectedCat === 'ALL' || p.categorySlug === selectedCat;
      const matchSearch = !productSearch || p.title?.toLowerCase().includes(productSearch.toLowerCase()) || p.id?.toLowerCase().includes(productSearch.toLowerCase());
      return matchCat && matchSearch;
    })
    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

  const handleMoveProduct = async (productId: string, dir: -1 | 1) => {
    haptic('medium');
    const ordered = filteredProducts.map((p) => p.id);
    const i = ordered.indexOf(productId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    try {
      await tzReorderProducts(ordered);
      notify('Product order updated', 'success');
      refetchProds();
    } catch (e: any) {
      notify(e.message || 'Reorder failed', 'error');
    }
  };

  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = filteredProducts.slice(
    (productPage - 1) * PRODUCTS_PER_PAGE,
    productPage * PRODUCTS_PER_PAGE
  );

  const pendingOrdersCount = allOrders.filter((o: any) => o.status === 'PENDING').length;
  const deliveredOrdersCount = allOrders.filter((o: any) => o.status === 'DELIVERED').length;
  const pendingDepositsCount = allIntents.filter((i: any) => i.status === 'PENDING' || i.status === 'NEEDS_REVIEW').length;
  const isRefreshingAny = dashRefetching || ordersRefetching || prodsRefetching;

  const refreshAll = () => {
    haptic('medium');
    refetchDash();
    refetchOrders();
    refetchProds();
    refetchCats();
    notify('Syncing live data…', 'info');
  };

  // Reusable Delivery Ready View (Optimized for Mobile Telegram UI)
  const renderDeliveryReadyContent = (product: TzProduct, onCollapse?: () => void) => {
    const rows = (vaultData?.rows ?? []) as VaultRow[];
    const availableCount = vaultData?.available ?? product.stock;
    const soldCount = rows.length - availableCount;

    // Filter and search delivery items
    const filteredRows = rows.filter((r: VaultRow) => {
      if (vaultFilter === 'AVAILABLE' && r.status !== 'AVAILABLE') return false;
      if (vaultFilter === 'SOLD' && r.status !== 'SOLD') return false;
      if (vaultSearch.trim()) {
        const q = vaultSearch.toLowerCase().trim();
        const matchLogin = r.login.toLowerCase().includes(q);
        const matchOrder = r.orderId?.toLowerCase().includes(q);
        return matchLogin || matchOrder;
      }
      return true;
    });

    return (
      <div className="space-y-3.5">
        {/* Header: Telegram Native style with high-contrast badge pills */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30 shrink-0">
              <Package size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                Delivery ready — {product.title}
              </h3>
              <p className="text-[10px] text-slate-400 truncate">
                Accounts auto-deliver upon successful payment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                haptic('light');
                setVaultFilter(vaultFilter === 'AVAILABLE' ? 'ALL' : 'AVAILABLE');
              }}
              className={`rounded-xl px-2.5 py-1 text-[10px] font-extrabold transition active:scale-95 ${
                vaultFilter === 'AVAILABLE'
                  ? 'bg-emerald-500 text-black ring-2 ring-emerald-300 shadow-md shadow-emerald-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/30'
              }`}
              title="Filter Available"
            >
              AVAILABLE {availableCount}
            </button>

            <button
              onClick={() => {
                haptic('light');
                setVaultFilter(vaultFilter === 'SOLD' ? 'ALL' : 'SOLD');
              }}
              className={`rounded-xl px-2.5 py-1 text-[10px] font-bold transition active:scale-95 ${
                vaultFilter === 'SOLD'
                  ? 'bg-slate-700 text-white ring-2 ring-slate-400 shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
              title="Filter Sold"
            >
              SOLD {Math.max(0, soldCount)}
            </button>

            {onCollapse && (
              <button
                onClick={() => {
                  haptic('light');
                  onCollapse();
                }}
                className="rounded-xl bg-slate-800/80 p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 active:scale-95 transition"
                title="Collapse"
              >
                <ChevronUp size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Telegram Controls Bar: Instant Search + Filter Pills + View Switcher */}
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search login, email or order #..."
              value={vaultSearch}
              onChange={(e) => setVaultSearch(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 pl-8.5 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 transition"
            />
            {vaultSearch && (
              <button
                onClick={() => {
                  haptic('light');
                  setVaultSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Quick Filter Pills & Layout View Switcher */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['ALL', 'AVAILABLE', 'SOLD'] as const).map((filter) => {
                const isActive = vaultFilter === filter;
                const count =
                  filter === 'ALL'
                    ? rows.length
                    : filter === 'AVAILABLE'
                    ? availableCount
                    : Math.max(0, soldCount);

                return (
                  <button
                    key={filter}
                    onClick={() => {
                      haptic('light');
                      setVaultFilter(filter);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition active:scale-95 whitespace-nowrap flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5'
                    }`}
                  >
                    <span>{filter === 'ALL' ? 'All' : filter === 'AVAILABLE' ? 'Available' : 'Sold'}</span>
                    <span
                      className={`px-1 rounded text-[9px] font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* View Mode Toggle: Cards (Mobile-first) vs Table (Desktop) */}
            <div className="flex items-center rounded-xl bg-black/50 border border-white/10 p-0.5 shrink-0">
              <button
                onClick={() => {
                  haptic('light');
                  setVaultViewMode('cards');
                }}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition active:scale-95 ${
                  vaultViewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Mobile Cards View"
              >
                <Smartphone size={11} />
                <span>Cards</span>
              </button>
              <button
                onClick={() => {
                  haptic('light');
                  setVaultViewMode('table');
                }}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition active:scale-95 ${
                  vaultViewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Table View"
              >
                <Layers size={11} />
                <span>Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= CONTENT: MOBILE TELEGRAM CARDS VIEW ================= */}
        {vaultViewMode === 'cards' ? (
          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-0.5 no-scrollbar">
            {vaultLoading ? (
              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6 text-center text-xs text-slate-500">
                <RefreshCw size={16} className="mx-auto mb-2 animate-spin text-emerald-400" />
                Loading delivery items…
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-6 text-center text-xs text-slate-400 space-y-1">
                <Package size={22} className="mx-auto text-slate-600" />
                <p className="font-semibold text-slate-300">No delivery items found</p>
                <p className="text-[11px] text-slate-500">
                  {rows.length === 0
                    ? 'Add single credentials or bulk import accounts below.'
                    : 'Try adjusting your search or filter.'}
                </p>
              </div>
            ) : (
              filteredRows.map((r: VaultRow, idx: number) => {
                const isAvail = r.status === 'AVAILABLE';
                const isRevealed = !!revealedVault[r.id];

                return (
                  <div
                    key={r.id}
                    className={`rounded-2xl border p-3 space-y-2.5 transition active:scale-[0.99] relative overflow-hidden ${
                      isAvail
                        ? 'bg-gradient-to-br from-slate-900/90 via-[#0e1424] to-emerald-950/20 border-emerald-500/20 shadow-xs'
                        : 'bg-slate-900/60 border-white/5 opacity-80'
                    }`}
                  >
                    {/* Card Top: Index, Login (Username/Email), Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/5 text-[9px] font-mono text-slate-400 shrink-0 border border-white/5">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold text-white break-all select-all flex items-center gap-1.5">
                            {r.login}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          isAvail
                            ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-white/5'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isAvail ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                          }`}
                        />
                        {r.status}
                      </span>
                    </div>

                    {/* Card Middle: Password with Reveal & Quick Copy */}
                    <div className="rounded-xl bg-black/50 border border-white/5 px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <KeyRound size={13} className="text-slate-500 shrink-0" />
                        <span className="text-[10px] text-slate-400 uppercase font-semibold shrink-0">Pass:</span>
                        <span
                          className={`font-mono text-xs truncate ${
                            isRevealed ? 'text-emerald-300 font-bold tracking-normal' : 'text-slate-400 tracking-widest'
                          }`}
                        >
                          {isRevealed ? r.password : '••••••••'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            haptic('light');
                            setRevealedVault((v) => ({ ...v, [r.id]: !v[r.id] }));
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition"
                          title={isRevealed ? 'Hide password' : 'Show password'}
                        >
                          {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          onClick={() => {
                            haptic('light');
                            copyText(r.password, 'Password copied');
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition"
                          title="Copy password"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Card Metadata: Order details or Delivery availability */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                      {r.orderId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">Order:</span>
                          <span className="font-mono font-bold text-blue-400">
                            #{r.orderId.slice(-8).toUpperCase()}
                          </span>
                          <span>•</span>
                          <span>{formatVaultDate(r.soldAt)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-400/80">
                          <CheckCircle size={11} className="text-emerald-400" />
                          <span>Ready for auto-delivery on order</span>
                        </div>
                      )}
                    </div>

                    {/* Card Action Row: Copy Both, Edit, Delete (Touch Optimized) */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                      <button
                        onClick={() => {
                          haptic('light');
                          copyText(`${r.login} | ${r.password}`, 'Credentials copied');
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 active:scale-98 py-1.5 px-2.5 text-[11px] font-semibold text-slate-200 border border-white/5 transition"
                        title="Copy login and password"
                      >
                        <Copy size={12} className="text-slate-400" />
                        <span>Copy Both</span>
                      </button>

                      <button
                        onClick={() => {
                          haptic('light');
                          handleStartEditVaultRow(r);
                        }}
                        className="flex items-center justify-center gap-1 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 active:scale-95 py-1.5 px-3 text-[11px] font-semibold text-blue-400 border border-blue-500/30 transition"
                        title="Edit item"
                      >
                        <Pencil size={12} />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => {
                          haptic('warning');
                          setDeletingVaultId(r.id);
                        }}
                        className="flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 py-1.5 px-3 text-rose-400 border border-rose-500/20 transition"
                        title="Delete item"
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
          /* ================= CONTENT: RESPONSIVE COMPACT TABLE VIEW ================= */
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 max-h-[50vh]">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/5 bg-slate-900 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="p-2.5">Login</th>
                  <th className="p-2.5">Password</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Order / Sold at</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {vaultLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-slate-500">
                      Loading delivery items…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-slate-500">
                      No delivery items match criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r: VaultRow) => (
                    <tr key={r.id} className="hover:bg-slate-900/60 transition">
                      <td className="p-2.5 text-slate-200 font-medium">{r.login}</td>
                      <td className="p-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="text-emerald-300">
                            {revealedVault[r.id] ? r.password : '••••••••'}
                          </span>
                          <button
                            onClick={() => {
                              haptic('light');
                              setRevealedVault((v) => ({ ...v, [r.id]: !v[r.id] }));
                            }}
                            className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-white"
                            title="Reveal password"
                          >
                            {revealedVault[r.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => {
                              haptic('light');
                              copyText(r.password, 'Password');
                            }}
                            className="rounded-md border border-white/10 p-1 text-slate-400 hover:text-white"
                            title="Copy password"
                          >
                            <Copy size={12} />
                          </button>
                        </span>
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${
                            r.status === 'AVAILABLE'
                              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-400">
                        {r.orderId ? `#${r.orderId.slice(-8).toUpperCase()}` : '#—'} · {formatVaultDate(r.soldAt)}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              haptic('light');
                              handleStartEditVaultRow(r);
                            }}
                            className="rounded-md border border-blue-500/30 bg-blue-600/10 p-1.5 text-blue-400 hover:bg-blue-600/20"
                            title="Edit delivery item"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => {
                              haptic('light');
                              copyText(`${r.login} | ${r.password}`, 'Login + password');
                            }}
                            className="rounded-md border border-white/10 bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                            title="Copy row"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => {
                              haptic('warning');
                              setDeletingVaultId(r.id);
                            }}
                            className="rounded-md border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                            title="Delete item"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Telegram Tabbed Add & Bulk Import (Space-Efficient for Mobile) */}
        <div className="rounded-2xl bg-slate-900 border border-white/10 p-3 space-y-2.5">
          {/* Segmented Switcher */}
          <div className="flex items-center rounded-xl bg-black/40 border border-white/5 p-1">
            <button
              onClick={() => {
                haptic('light');
                setVaultAddTab('single');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition active:scale-95 ${
                vaultAddTab === 'single'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus size={13} />
              <span>Add Single Account</span>
            </button>
            <button
              onClick={() => {
                haptic('light');
                setVaultAddTab('bulk');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition active:scale-95 ${
                vaultAddTab === 'bulk'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload size={13} />
              <span>Bulk Import</span>
            </button>
          </div>

          {/* Tab 1: Single Add */}
          {vaultAddTab === 'single' ? (
            <div className="space-y-2 animate-in fade-in duration-150">
              <input
                type="text"
                placeholder="Login (email / username)"
                value={vaultLogin}
                onChange={(e) => setVaultLogin(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Password"
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
              />
              <button
                onClick={() => {
                  haptic('light');
                  handleAddVaultItem(product.id);
                }}
                disabled={vaultBusy}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2 text-xs font-bold text-white transition active:scale-98 shadow-md shadow-emerald-900/30 disabled:opacity-50"
              >
                <Plus size={14} />
                <span>{vaultBusy ? 'Adding…' : 'Add to Delivery Vault'}</span>
              </button>
            </div>
          ) : (
            /* Tab 2: Bulk Import */
            <div className="space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-1">
                <span>
                  Format: <span className="font-mono text-purple-300 font-semibold">login | password</span> or <span className="font-mono text-cyan-300 font-semibold">login:password</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      haptic('light');
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          setVaultBulk((prev) => (prev ? `${prev}\n${text}` : text));
                          notify('Pasted from clipboard', 'info');
                        }
                      } catch {
                        notify('Clipboard access unavailable — please paste manually', 'error');
                      }
                    }}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-white/10 active:scale-95 transition"
                  >
                    📋 Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      setVaultBulk(
                        `sample_user1@tzstore.io | Pass123!\nsample_user2@tzstore.io:Pass456!\nsample_user3@tzstore.io----Pass789!`
                      );
                      notify('Sample accounts loaded', 'info');
                    }}
                    className="rounded-lg bg-purple-600/20 hover:bg-purple-600/30 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30 active:scale-95 transition"
                  >
                    🧪 Insert Sample
                  </button>
                  {vaultBulk && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        setVaultBulk('');
                      }}
                      className="rounded-lg bg-rose-500/10 hover:bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 active:scale-95 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <textarea
                rows={3}
                placeholder={'Paste accounts here (one per line)...\nSupported: login | password, login:password, login----password'}
                value={vaultBulk}
                onChange={(e) => setVaultBulk(e.target.value)}
                className="w-full rounded-xl bg-black/40 border border-white/10 p-2.5 font-mono text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-purple-500"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className={vaultBulk.trim() ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {vaultBulk.trim()
                    ? `✓ ${vaultBulk.trim().split('\n').filter(Boolean).length} accounts detected`
                    : '0 accounts entered'}
                </span>
                <button
                  onClick={() => {
                    haptic('light');
                    handleImportVaultBulk(product.id);
                  }}
                  disabled={vaultBusy || !vaultBulk.trim()}
                  className="flex items-center gap-1 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed py-1.5 px-4 text-xs font-bold text-white transition active:scale-98 shadow-md shadow-purple-900/30"
                >
                  <Upload size={13} />
                  <span>{vaultBusy ? 'Importing…' : 'Import Vault'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex justify-center items-center p-0 md:py-6 md:px-4 font-sans selection:bg-blue-600 selection:text-white">
      {/* Phone Shell for Desktop / Responsive Fullscreen for Mobile */}
      <div className="w-full max-w-[460px] min-h-screen md:min-h-[890px] md:max-h-[940px] md:rounded-[42px] bg-[#0c101d] text-slate-100 flex flex-col relative md:shadow-[0_25px_80px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.08)] overflow-hidden">
        
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[340px] h-[180px] bg-gradient-to-b from-blue-600/15 via-indigo-600/5 to-transparent blur-3xl pointer-events-none" />

        {/* Desktop Mock Phone Status Bar */}
        <div className="hidden md:flex items-center justify-between px-6 pt-3 text-[11px] font-semibold text-slate-400 select-none z-30">
          <span>9:41</span>
          <div className="h-4 w-28 bg-black/80 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
            <span className="text-[8px] font-bold text-slate-300">TZ FULL ADMIN</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi size={12} />
            <Battery size={13} />
          </div>
        </div>

        {/* ================= HEADER ================= */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#0c101d]/90 backdrop-blur-xl border-b border-white/5">
          {/* Brand & Status Pill */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-black text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/20">
                TZ
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-[#0c101d]" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-tight">
                <h1 className="text-sm font-extrabold tracking-tight text-white">{mobileStoreName || 'TZ Store'} Operations</h1>
                <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-blue-400 ring-1 ring-blue-500/20">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Supabase Live</span>
                <span className="text-slate-600">•</span>
                <span className="text-[10px] text-slate-500 uppercase">{activeTab}</span>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Live Sync Refresh */}
            <button
              onClick={refreshAll}
              title="Refresh Live Data"
              className={`rounded-xl p-2 text-slate-400 transition hover:bg-white/5 hover:text-white active:scale-95 ${
                isRefreshingAny ? 'animate-spin text-blue-400' : ''
              }`}
            >
              <RefreshCw size={16} />
            </button>

            {/* Switch to Web Dashboard */}
            <Link
              to="/"
              onClick={() => haptic('medium')}
              title="Open Desktop Web Admin"
              className="flex items-center gap-1 rounded-xl bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              <Monitor size={13} className="text-blue-400" />
              <span>Web</span>
            </Link>
          </div>
        </header>

        {/* ================= SECONDARY MODULE PILL BAR (QUICK ACCESS) ================= */}
        <div className="flex items-center gap-1 px-3 py-2 bg-[#0a0e19] border-b border-white/5 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
            { id: 'products', label: 'Products', Icon: Package },
            { id: 'categories', label: 'Categories', Icon: Tags },
            { id: 'orders', label: 'Orders', Icon: ReceiptText, badge: pendingOrdersCount },
            { id: 'deposits', label: 'Payments', Icon: CreditCard, badge: pendingDepositsCount },
            { id: 'users', label: 'Users', Icon: UsersIcon },
            { id: 'settings', label: 'Settings', Icon: Settings },
            { id: 'tools', label: 'Broadcast', Icon: Send },
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  haptic('light');
                  setActiveTab(item.id as any);
                }}
                className={`relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold whitespace-nowrap transition shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <item.Icon size={13} />
                <span>{item.label}</span>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="ml-0.5 flex h-4 min-w-[15px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ================= ACTION NOTICE BANNER ================= */}
        {actionNotice && (
          <div className="sticky top-[98px] z-40 mx-3 my-2 flex items-center justify-between rounded-xl bg-slate-900/95 border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-white shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              {actionNotice.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
              {actionNotice.type === 'error' && <AlertCircle size={16} className="text-rose-400 shrink-0" />}
              {actionNotice.type === 'info' && <Sparkles size={16} className="text-cyan-400 shrink-0" />}
              <span>{actionNotice.msg}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white p-1">
              <X size={13} />
            </button>
          </div>
        )}

        {/* ================= MAIN SCROLLABLE CONTENT ================= */}
        <main className="flex-1 overflow-y-auto px-3.5 py-3 pb-28 no-scrollbar">

          {/* ========================================================= */}
          {/* TAB 1: OVERVIEW (EXECUTIVE DASHBOARD)                     */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Luxury Revenue Hero Card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-5 text-white shadow-xl shadow-blue-600/20 ring-1 ring-white/20">
                <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-cyan-400/20 blur-xl pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between text-blue-100/80">
                    <span className="text-[10px] font-bold tracking-[0.14em] uppercase">Total Revenue Settled</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold backdrop-blur-md">
                      <TrendingUp size={11} className="text-emerald-300" />
                      <span>Live 30d</span>
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black tracking-tight">
                      ${Number(dashboard?.kpis?.revenueUsdt || 0).toFixed(2)}
                    </span>
                    <span className="text-xs font-bold text-blue-200 uppercase">USDT</span>
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 text-xs">
                    <div>
                      <div className="text-[10px] text-blue-200 font-medium">Today&apos;s Revenue</div>
                      <div className="font-extrabold text-white text-sm">
                        ${Number(dashboard?.kpis?.todayRevenue || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-200 font-medium">Delivered Orders</div>
                      <div className="font-extrabold text-white text-sm">
                        {deliveredOrdersCount} of {allOrders.length}
                      </div>
                    </div>
                  </div>

                  {/* 3 Fast Action Buttons inside Hero */}
                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => {
                        haptic('medium');
                        setOrderFilter('PENDING');
                        setActiveTab('orders');
                      }}
                      className="flex items-center justify-center gap-1 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 py-2 text-[11px] font-bold text-white backdrop-blur-md transition shadow-xs"
                    >
                      <Zap size={13} className="text-amber-300" />
                      <span>Fulfill ({pendingOrdersCount})</span>
                    </button>

                    <button
                      onClick={() => {
                        haptic('light');
                        setActiveTab('products');
                      }}
                      className="flex items-center justify-center gap-1 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 py-2 text-[11px] font-bold text-white backdrop-blur-md transition"
                    >
                      <Package size={13} className="text-blue-200" />
                      <span>Products</span>
                    </button>

                    <button
                      onClick={() => {
                        haptic('light');
                        setActiveTab('tools');
                      }}
                      className="flex items-center justify-center gap-1 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 py-2 text-[11px] font-bold text-white backdrop-blur-md transition"
                    >
                      <Send size={13} className="text-cyan-200" />
                      <span>Broadcast</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2x2 Metric KPI Tiles */}
              <div className="grid grid-cols-2 gap-2.5">
                <div
                  onClick={() => {
                    haptic('light');
                    setActiveTab('orders');
                  }}
                  className="cursor-pointer rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 transition hover:bg-slate-900 active:scale-98"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Orders</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                      <ReceiptText size={15} />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{allOrders.length}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>{pendingOrdersCount} awaiting deliver</span>
                  </div>
                </div>

                <div
                  onClick={() => {
                    haptic('light');
                    setActiveTab('deposits');
                  }}
                  className="cursor-pointer rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 transition hover:bg-slate-900 active:scale-98"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Payments</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                      <CreditCard size={15} />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{allIntents.length}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-400 font-semibold">
                    <span>{pendingDepositsCount} pending review</span>
                  </div>
                </div>

                <div
                  onClick={() => {
                    haptic('light');
                    setActiveTab('products');
                  }}
                  className="cursor-pointer rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 transition hover:bg-slate-900 active:scale-98"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Products</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      <Package size={15} />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{allProducts.length}</div>
                  <div className="mt-1 text-[10px] text-slate-400 font-medium">Across {allCategories.length} categories</div>
                </div>

                <div
                  onClick={() => {
                    haptic('light');
                    setActiveTab('users');
                  }}
                  className="cursor-pointer rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 transition hover:bg-slate-900 active:scale-98"
                >
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Users</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                      <UsersIcon size={15} />
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{allUsers.length || 'Active'}</div>
                  <div className="mt-1 text-[10px] text-cyan-400 font-semibold">Customer Accounts</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                    <Clock size={14} className="text-blue-400" />
                    <span>Recent Activity Stream</span>
                  </div>
                  <button onClick={() => setActiveTab('orders')} className="text-[11px] font-bold text-blue-400 hover:text-blue-300">
                    View All
                  </button>
                </div>

                <div className="space-y-2">
                  {allOrders.slice(0, 5).map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between rounded-xl bg-slate-800/40 p-2.5 transition hover:bg-slate-800/70">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white truncate max-w-[130px]">{order.productId}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                            order.status === 'PENDING' ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                          TG: {order.userTg} • #{order.id.slice(-6)}
                        </div>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <div className="font-extrabold text-xs text-white">${Number(order.total || 0).toFixed(2)}</div>
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => {
                              haptic('medium');
                              fulfillMutation.mutate(order.id);
                            }}
                            className="mt-1 rounded-lg bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-blue-500"
                          >
                            Deliver
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: PRODUCTS (CATEGORY PRODUCT - WITH ALL DESKTOP BUTTONS!) */}
          {/* ========================================================= */}
          {activeTab === 'products' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Top Header matching Desktop: "Category Product", "TZ Store live", CSV Export, New Product */}
              <div className="rounded-2xl bg-slate-900/80 border border-white/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
                      <Package size={17} />
                    </span>
                    <div>
                      <h2 className="text-sm font-extrabold text-white">Category Product</h2>
                      <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.2 text-[9px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                        TZ Store live ({allProducts.length})
                      </span>
                    </div>
                  </div>

                  {/* DESKTOP-MATCHING BUTTONS: CSV Export & + New product */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportProductsCsv}
                      title="Export products to CSV"
                      className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 px-2.5 py-1.5 text-xs font-bold text-slate-200 border border-white/10 transition"
                    >
                      <FileSpreadsheet size={13} className="text-blue-400" />
                      <span>CSV</span>
                    </button>

                    <button
                      onClick={() => {
                        haptic('medium');
                        setCreatingProduct(true);
                      }}
                      className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 px-3 py-1.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/30 transition"
                    >
                      <Plus size={14} />
                      <span>New product</span>
                    </button>
                  </div>
                </div>

                {/* Search Bar & Category Dropdown Filter */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search title or id…"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full rounded-xl bg-black/40 border border-white/10 pl-7 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <select
                    value={selectedCat}
                    onChange={(e) => setSelectedCat(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="ALL">All categories</option>
                    {allCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Horizontal Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button
                  onClick={() => setSelectedCat('ALL')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold shrink-0 transition ${
                    selectedCat === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-900/60 text-slate-400'
                  }`}
                >
                  All ({allProducts.length})
                </button>
                {allCategories.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => setSelectedCat(c.slug)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-bold shrink-0 transition ${
                      selectedCat === c.slug ? 'bg-blue-600 text-white' : 'bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    {c.emoji || '📦'} {c.name}
                  </button>
                ))}
              </div>

              {/* Product Cards with ALL ACTION BUTTONS (Edit, Delivery, Accordion Toggle, Restock) */}
              <div className="space-y-3">
                {paginatedProducts.map((p) => {
                  const stockNum = Number(p.stock || 0);
                  const isOutOfStock = stockNum <= 0;
                  const isLowStock = stockNum > 0 && stockNum <= 3;
                  const isDeliveryOpen = expandedDeliveryProductId === p.id;

                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 shadow-sm transition hover:bg-slate-900"
                    >
                      {/* Top Row: Title, Category, Price, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1">
                              <span className="rounded-md bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30 px-1.5 py-0.5 text-[9px] font-black">
                                #{p.sortOrder ?? (filteredProducts.findIndex((x) => x.id === p.id) + 1)}
                              </span>
                              <div className="flex items-center bg-slate-800 rounded p-0.5 border border-white/5">
                                <button
                                  type="button"
                                  title="Move up (higher priority)"
                                  onClick={(e) => { e.stopPropagation(); handleMoveProduct(p.id, -1); }}
                                  className="p-0.5 text-slate-400 hover:text-white active:scale-90"
                                >
                                  <ChevronUp size={11} />
                                </button>
                                <button
                                  type="button"
                                  title="Move down (lower priority)"
                                  onClick={(e) => { e.stopPropagation(); handleMoveProduct(p.id, 1); }}
                                  className="p-0.5 text-slate-400 hover:text-white active:scale-90"
                                >
                                  <ChevronDown size={11} />
                                </button>
                              </div>
                            </div>
                            <h3 className="font-extrabold text-xs text-white truncate max-w-[170px]">
                              {p.title}
                            </h3>
                            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 uppercase">
                              {p.categorySlug}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-black text-sm text-emerald-400">
                              ${Number(p.priceUsdt || 0).toFixed(2)}
                            </span>
                            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                              isOutOfStock
                                ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30'
                                : isLowStock
                                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                            }`}>
                              Stock: {stockNum}
                            </span>
                            <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                              ACTIVE
                            </span>
                          </div>
                        </div>

                        {/* Thumbnail if present */}
                        {p.logo && (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-800/80 p-1 flex items-center justify-center">
                            <img
                              src={tzLogoUrl(p.logo)}
                              alt={p.title}
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* ACTION BUTTONS ON EACH ROW: Edit, Delivery, Accordion chevron, Restock */}
                      <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-white/5 pt-2.5">
                        {/* EDIT BUTTON (Pencil) */}
                        <button
                          onClick={() => {
                            haptic('light');
                            setEditingProduct(p);
                            setETitle(p.title);
                            setECat(p.categorySlug);
                            setEPrice(String(p.priceUsdt));
                            setESortOrder(String(p.sortOrder ?? (filteredProducts.findIndex((x) => x.id === p.id) + 1)));
                            setEDesc(p.desc || '');
                            setEPhoto(p.logo || '');
                            setEPreview(p.logo || '');
                            setETiers(p.tiers ? JSON.parse(JSON.stringify(p.tiers)) : []);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 py-2 text-xs font-bold text-slate-200 border border-white/10 transition"
                        >
                          <Pencil size={13} className="text-blue-400" />
                          <span>Edit</span>
                        </button>

                        {/* DELIVERY BUTTON (Package/Key) */}
                        <button
                          onClick={() => {
                            haptic('light');
                            setDeliveryProduct(p);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 active:scale-95 py-2 text-xs font-extrabold text-blue-300 border border-blue-500/30 transition"
                        >
                          <Package size={13} />
                          <span>Delivery</span>
                        </button>

                        {/* ACCORDION TOGGLE (⌄ / ⌃) - 1:1 Matching Desktop */}
                        <button
                          onClick={() => {
                            haptic('light');
                            setExpandedDeliveryProductId((prev) => (prev === p.id ? null : p.id));
                          }}
                          className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 p-2 text-xs font-bold text-slate-400 border border-white/10 transition"
                          title="Toggle delivery ready table inline"
                        >
                          {isDeliveryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {/* RESTOCK BUTTON */}
                        <button
                          onClick={() => {
                            haptic('light');
                            setRestockProduct(p);
                            setRestockQty(5);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 py-2 text-xs font-bold text-emerald-300 border border-emerald-500/30 transition"
                        >
                          <Plus size={13} />
                          <span>Restock</span>
                        </button>
                      </div>

                      {/* INLINE DELIVERY READY TABLE (IF EXPANDED DIRECTLY LIKE DESKTOP) */}
                      {isDeliveryOpen && (
                        <div className="mt-3.5 pt-3 border-t border-white/10 space-y-3 animate-in fade-in duration-200">
                          {renderDeliveryReadyContent(p, () => setExpandedDeliveryProductId(null))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No products found. Tap &quot;New product&quot; above to create one.
                  </div>
                )}

                {/* Pagination Controls Matching Desktop: < Page X/Y > */}
                {filteredProducts.length > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-900/80 border border-white/5 p-3 text-xs">
                    <button
                      onClick={() => {
                        haptic('light');
                        setProductPage((pg) => Math.max(1, pg - 1));
                      }}
                      disabled={productPage === 1}
                      className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 px-3 py-1.5 font-bold text-slate-300 hover:text-white disabled:opacity-40 transition"
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>
                    <span className="font-extrabold text-slate-300">
                      Page {productPage} / {totalProductPages}
                    </span>
                    <button
                      onClick={() => {
                        haptic('light');
                        setProductPage((pg) => Math.min(totalProductPages, pg + 1));
                      }}
                      disabled={productPage >= totalProductPages}
                      className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 px-3 py-1.5 font-bold text-slate-300 hover:text-white disabled:opacity-40 transition"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: CATEGORIES MANAGER (CREATE, REORDER, DELETE)       */}
          {/* ========================================================= */}
          {activeTab === 'categories' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-white">Categories ({allCategories.length})</h2>
                  <p className="text-[11px] text-slate-400">Live store catalog hierarchy</p>
                </div>
                <button
                  onClick={() => {
                    haptic('medium');
                    setCatNameInput('');
                    setCreatingCategory(true);
                  }}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 px-3 py-1.5 text-xs font-bold text-white shadow-md transition"
                >
                  <Plus size={14} /> New category
                </button>
              </div>

              <div className="space-y-2">
                {allCategories.map((c, idx) => (
                  <div
                    key={c.slug}
                    className="flex items-center justify-between rounded-2xl bg-slate-900/70 border border-white/5 p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-lg">
                        {c.emoji || '📁'}
                      </span>
                      <div>
                        <div className="font-extrabold text-xs text-white">{c.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">/{c.slug}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleMoveCategory(c.slug, -1)}
                        disabled={idx === 0}
                        className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => handleMoveCategory(c.slug, 1)}
                        disabled={idx === allCategories.length - 1}
                        className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(c.slug, c.name)}
                        className="rounded-lg bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: ORDERS (FULL TERMINAL + 1-TAP DELIVER + CSV)       */}
          {/* ========================================================= */}
          {activeTab === 'orders' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {/* Header with Sync, CSV Export, Reset Book (Matching Desktop) */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-white">Orders ({allOrders.length})</h2>
                  <p className="text-[11px] text-slate-400">{pendingOrdersCount} pending fulfillment</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      haptic('light');
                      refetchOrders();
                      notify('Orders synced', 'info');
                    }}
                    className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 px-2.5 py-1.5 text-xs font-bold text-slate-200 border border-white/10 transition"
                    title="Sync orders"
                  >
                    <RefreshCw size={13} className={`text-emerald-400 ${ordersRefetching ? 'animate-spin' : ''}`} />
                    <span>Sync</span>
                  </button>
                  <button
                    onClick={exportOrdersCsv}
                    className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 px-2.5 py-1.5 text-xs font-bold text-slate-200 border border-white/10 transition"
                    title="Export orders to CSV"
                  >
                    <FileSpreadsheet size={13} className="text-blue-400" />
                    <span>CSV</span>
                  </button>
                  {allOrders.length > 0 && (
                    <button
                      onClick={handleClearAllOrders}
                      className="flex items-center gap-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 px-2.5 py-1.5 text-xs font-bold text-rose-300 border border-rose-500/20 transition"
                      title="Reset test orders"
                    >
                      <Trash2 size={13} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Segmented Filter Pills */}
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-900/90 border border-white/5 p-1">
                {[
                  { id: 'ALL', label: `All (${allOrders.length})` },
                  { id: 'PENDING', label: `⚡ Pending (${pendingOrdersCount})` },
                  { id: 'DELIVERED', label: `✓ Delivered (${deliveredOrdersCount})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      haptic('light');
                      setOrderFilter(tab.id as any);
                    }}
                    className={`rounded-xl py-2 text-xs font-extrabold transition active:scale-95 ${
                      orderFilter === tab.id
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Order Cards List */}
              <div className="space-y-2.5">
                {filteredOrders.map((order: any) => {
                  const isPending = order.status === 'PENDING';
                  const isDelivered = order.status === 'DELIVERED';
                  const isExpanded = expandedOrder === order.id;

                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl bg-slate-900/70 border border-white/5 p-3.5 shadow-sm transition hover:bg-slate-900"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copyText(order.id, 'Order ID')}
                            className="flex items-center gap-1 font-mono text-[11px] font-bold text-slate-300 hover:text-white"
                          >
                            <span>#{order.id.slice(-8)}</span>
                            <Copy size={11} className="text-slate-500" />
                          </button>
                          <span className="text-slate-600">•</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                          isPending
                            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                            : isDelivered
                            ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                        }`}>
                          {order.status}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-extrabold text-white">
                            {order.productId}
                            {order.qty > 1 && <span className="ml-1 text-blue-400">x{order.qty}</span>}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            Telegram User: <span className="font-mono text-slate-300">{order.userTg}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black text-white">
                            ${Number(order.total || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 uppercase">USDT</div>
                        </div>
                      </div>

                      {/* 1-Tap Fulfillment Button */}
                      {isPending && (
                        <div className="mt-3 border-t border-white/5 pt-2.5">
                          <button
                            onClick={() => {
                              haptic('heavy');
                              fulfillMutation.mutate(order.id);
                            }}
                            disabled={fulfillMutation.isPending}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
                          >
                            <Zap size={14} className="text-amber-300" />
                            <span>
                              {fulfillMutation.isPending ? 'Fulfilling & Delivering…' : '⚡ 1-Tap Fulfill & Deliver'}
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Delivered Credentials Expandable Drawer + Refund Action */}
                      {isDelivered && (
                        <div className="mt-3 border-t border-white/5 pt-2">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                              className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                            >
                              <CheckCircle size={12} />
                              <span>Delivered Credentials</span>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            <button
                              onClick={() => handleRefundOrder(order.id)}
                              className="flex items-center gap-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 active:scale-95 px-2 py-1 text-[10px] font-extrabold text-purple-300 border border-purple-500/30 transition"
                              title="Refund this order and restore stock"
                            >
                              <RefreshCw size={11} />
                              <span>Refund</span>
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 rounded-xl bg-black/40 border border-white/5 p-2.5 text-[11px] space-y-1.5 font-mono">
                              {order.deliveries && order.deliveries.length > 0 ? (
                                order.deliveries.map((del: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between text-slate-300">
                                    <div className="truncate">
                                      <span className="text-slate-500">#{idx + 1} </span>
                                      <span>{del.login}</span> : <span>{del.password}</span>
                                    </div>
                                    <button
                                      onClick={() => copyText(`${del.login}:${del.password}`, 'Credentials')}
                                      className="text-blue-400 hover:text-white p-1"
                                    >
                                      <Copy size={11} />
                                    </button>
                                  </div>
                                ))
                              ) : order.code ? (
                                <div className="flex items-center justify-between text-slate-300">
                                  <span>Voucher: {order.code}</span>
                                  <button onClick={() => copyText(order.code, 'Code')} className="text-blue-400">
                                    <Copy size={11} />
                                  </button>
                                </div>
                              ) : (
                                <div className="text-slate-500 text-[10px]">Delivered directly to Telegram chat.</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: PAYMENTS / DEPOSITS                                */}
          {/* ========================================================= */}
          {activeTab === 'deposits' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/70 border border-white/5 p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Crypto Inflow</div>
                    <div className="text-lg font-black text-white mt-0.5">Payments & Deposits</div>
                  </div>
                  <span className="rounded-xl bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-400 border border-purple-500/20">
                    {allIntents.length} Logged
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                {allIntents.map((intent: any) => {
                  const isPaid = intent.status === 'PAID' || intent.status === 'COMPLETED';
                  const isPending = intent.status === 'PENDING' || intent.status === 'NEEDS_REVIEW';

                  return (
                    <div key={intent.id} className="rounded-2xl bg-slate-900/70 border border-white/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                          intent.provider === 'BINANCE'
                            ? 'bg-amber-400/20 text-amber-300'
                            : 'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {intent.provider}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                          isPaid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {intent.status}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-300">
                            Order Ref: <span className="font-mono text-white">#{intent.orderId}</span>
                          </div>
                          {intent.txHash && (
                            <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-slate-400">
                              <span>TxID: {intent.txHash.slice(0, 10)}…{intent.txHash.slice(-6)}</span>
                              <button onClick={() => copyText(intent.txHash, 'TxID')} className="text-blue-400">
                                <Copy size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-white">{intent.amount} {intent.asset}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: USERS MANAGER                                      */}
          {/* ========================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-white">Users & Wallets ({allUsers.length})</h2>
                  <p className="text-[11px] text-slate-400">Registered Telegram customer balances</p>
                </div>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Telegram ID or @username…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-white/10 pl-8 pr-3 py-2 text-xs text-white"
                />
              </div>

              <div className="space-y-2">
                {allUsers.map((u: any) => (
                  <div
                    key={u.telegramId}
                    className="flex items-center justify-between rounded-2xl bg-slate-900/70 border border-white/5 p-3"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-white">
                        {u.firstName || 'User'} <span className="font-mono text-[10px] text-slate-400">({u.telegramId})</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Wallet: <span className="font-extrabold text-emerald-400">${Number(u.walletBalance || 0).toFixed(2)}</span>
                        {u.username && <span className="ml-2 text-blue-400">@{u.username}</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        haptic('light');
                        setSelectedUserId(u.telegramId);
                      }}
                      className="rounded-xl bg-blue-600/20 border border-blue-500/30 px-3 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-600/30 active:scale-95 transition"
                    >
                      Profile & Balance
                    </button>
                  </div>
                ))}

                {allUsers.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-500">No users found.</div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: SETTINGS & CONFIGURATION                           */}
          {/* ========================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Store Profile & Branding */}
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 space-y-3">
                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <Store size={14} className="text-emerald-400" />
                  <span>Store Profile & Name</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Customizes the store name and support links across the customer storefront, Telegram Mini App header, About page, and Telegram bots.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Store Name</label>
                    <input
                      type="text"
                      placeholder="e.g. TZ Store"
                      value={mobileStoreName}
                      onChange={(e) => setMobileStoreName(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Support URL</label>
                    <input
                      type="text"
                      placeholder="https://t.me/TzStore_Support"
                      value={mobileSupportUrl}
                      onChange={(e) => setMobileSupportUrl(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Channel URL</label>
                    <input
                      type="text"
                      placeholder="https://t.me/TZStoreChannel"
                      value={mobileChannelUrl}
                      onChange={(e) => setMobileChannelUrl(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <button
                    onClick={handleSaveBranding}
                    disabled={savingBranding}
                    className="w-full mt-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white transition active:scale-98"
                  >
                    {savingBranding ? 'Saving…' : 'Save Store Branding'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 space-y-3">
                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <Shield size={14} className="text-blue-400" />
                  <span>Payment Gateway Tests</span>
                </h3>

                <div className="rounded-xl bg-slate-800/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">Binance Pay Connection</span>
                    <button
                      onClick={handleTestBinance}
                      disabled={testingBinance}
                      className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/30 active:scale-95"
                    >
                      {testingBinance ? 'Testing…' : 'Test Binance API'}
                    </button>
                  </div>
                  {binanceResult && (
                    <div className={`rounded-lg p-2 text-xs font-mono ${binanceResult.ok ? 'bg-emerald-950/40 text-emerald-300' : 'bg-rose-950/40 text-rose-300'}`}>
                      {binanceResult.ok ? '✅ Binance API connected & response verified!' : `❌ ${binanceResult.error || 'Failed'}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Password change */}
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 space-y-3">
                <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <Lock size={14} className="text-purple-400" />
                  <span>Change Admin Password</span>
                </h3>

                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder="Current Password"
                    value={changePwd.old}
                    onChange={(e) => setChangePwd((prev) => ({ ...prev, old: e.target.value }))}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    value={changePwd.next}
                    onChange={(e) => setChangePwd((prev) => ({ ...prev, next: e.target.value }))}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                  <button
                    onClick={handleChangePassword}
                    disabled={savingPwd}
                    className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 py-2 text-xs font-bold text-white transition active:scale-98"
                  >
                    {savingPwd ? 'Updating…' : 'Save New Password'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: TOOLS & BROADCAST                                  */}
          {/* ========================================================= */}
          {activeTab === 'tools' && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                    <Send size={14} className="text-blue-400" />
                    <span>Telegram Broadcast Studio</span>
                  </div>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-400">
                    All Customers
                  </span>
                </div>

                <div className="mt-3">
                  <textarea
                    rows={3}
                    placeholder="Type an announcement or discount voucher message to all Telegram users…"
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                  />

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {['🔥', '⚡', '🎉', '🎁', '📢', '💎', '🚀'].map((em) => (
                      <button
                        key={em}
                        onClick={() => {
                          haptic('light');
                          setBroadcastMsg((prev) => prev + em);
                        }}
                        className="rounded-lg bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 active:scale-95 transition"
                      >
                        {em}
                      </button>
                    ))}
                  </div>

                  {broadcastMsg && (
                    <div className="mt-3 rounded-xl bg-blue-950/40 border border-blue-500/20 p-2.5 text-xs">
                      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
                        Telegram Preview:
                      </div>
                      <div className="rounded-lg bg-[#17212b] p-2.5 text-white shadow-xs font-sans whitespace-pre-wrap">
                        {broadcastMsg}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (!broadcastMsg.trim()) {
                        notify('Please enter a message to broadcast', 'error');
                        return;
                      }
                      haptic('heavy');
                      broadcastMutation.mutate(broadcastMsg.trim());
                    }}
                    disabled={broadcastMutation.isPending || !broadcastMsg.trim()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition active:scale-98 disabled:opacity-50"
                  >
                    <Send size={13} />
                    <span>{broadcastMutation.isPending ? 'Broadcasting…' : 'Send Telegram Broadcast'}</span>
                  </button>
                </div>
              </div>

              {/* Infrastructure matrix */}
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 space-y-2 text-xs">
                <div className="font-extrabold text-white flex items-center gap-1.5 mb-2">
                  <Activity size={14} className="text-emerald-400" /> System Engine Matrix
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                  <span className="text-slate-400">Next.js Web Service</span>
                  <span className="text-emerald-400 font-bold">Port 3000 Active</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                  <span className="text-slate-400">Supabase Database</span>
                  <span className="text-emerald-400 font-bold">PostgreSQL Connected</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                  <span className="text-slate-400">Store Telegram Bot</span>
                  <span className="text-emerald-400 font-bold">Active (Customer Store)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                  <span className="text-slate-400">Admin Operations Bot</span>
                  <span className="text-emerald-400 font-bold">Active (Restricted Access)</span>
                </div>
              </div>

              {/* Shortcuts */}
              <div className="rounded-2xl bg-slate-900/70 border border-white/5 p-4 space-y-2">
                <Link
                  to="/"
                  className="flex items-center justify-between rounded-xl bg-slate-800/40 p-3 text-xs font-bold text-slate-200 hover:bg-slate-800 transition"
                >
                  <span className="flex items-center gap-2">
                    <Monitor size={15} className="text-blue-400" /> Open Desktop Web Dashboard
                  </span>
                  <ChevronRight size={14} />
                </Link>

                <a
                  href="http://localhost:3000/home"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl bg-slate-800/40 p-3 text-xs font-bold text-slate-200 hover:bg-slate-800 transition"
                >
                  <span className="flex items-center gap-2">
                    <Store size={15} className="text-emerald-400" /> Open Customer Storefront
                  </span>
                  <ExternalLink size={14} />
                </a>

                <button
                  onClick={() => {
                    localStorage.removeItem('tz_access');
                    localStorage.removeItem('tz_refresh');
                    nav('/login');
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20"
                >
                  <span className="flex items-center gap-2">
                    <LogOut size={15} /> Sign Out
                  </span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ================= MODAL 1: CREATE PRODUCT (FULL FEATURED) ================= */}
        {creatingProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4">
            <div
              className="w-full max-w-[460px] max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-3.5 no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <Plus size={16} className="text-emerald-400" /> New Product — TZ Store
                  </h3>
                  <p className="text-[11px] text-slate-400">Will be instantly live on Storefront & Bot</p>
                </div>
                <button
                  onClick={() => setCreatingProduct(false)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Photo Upload Box */}
              <div className="flex items-center gap-3 rounded-2xl bg-slate-900 border border-white/5 p-3">
                <button
                  type="button"
                  onClick={() => createPhotoFileRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-700 bg-slate-800 p-1"
                >
                  {nPreview ? (
                    <img src={nPreview.startsWith('data:') ? nPreview : tzLogoUrl(nPreview)} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus size={22} className="text-slate-400" />
                  )}
                </button>
                <div className="text-xs">
                  <div className="font-bold text-white">Product Photo</div>
                  <p className="text-[10px] text-slate-400">PNG / JPG under 2MB</p>
                  <input
                    ref={createPhotoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0], false)}
                  />
                  <button
                    type="button"
                    onClick={() => createPhotoFileRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="mt-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-300"
                  >
                    {uploadingPhoto ? 'Uploading…' : nPhoto ? 'Change Photo' : 'Upload Photo'}
                  </button>
                </div>
              </div>

              {/* Product Title */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Product Title</label>
                <input
                  type="text"
                  placeholder="e.g. Netflix Premium 1 Month"
                  value={nTitle}
                  onChange={(e) => setNTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Category, Price, Priority Serial */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                  <select
                    value={nCat}
                    onChange={(e) => setNCat(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2 py-2 text-xs text-white"
                  >
                    <option value="">Category…</option>
                    {allCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="4.99"
                    value={nPrice}
                    onChange={(e) => setNPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Priority #</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Next"
                    value={nSortOrder}
                    onChange={(e) => setNSortOrder(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Storefront Description</label>
                <textarea
                  rows={2}
                  placeholder="Marketing description shown on storefront and bot…"
                  value={nDesc}
                  onChange={(e) => setNDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 p-2.5 text-xs text-white"
                />
              </div>

              {/* Delivery Format & Delivery Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Delivery Format / Instructions</label>
                  <input
                    type="text"
                    placeholder="e.g. Format: Email | Password | 2FA"
                    value={nContents}
                    onChange={(e) => setNContents(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Delivery Mode</label>
                  <select
                    value={nDeliveryMode}
                    onChange={(e) => setNDeliveryMode(e.target.value as 'AUTO' | 'MANUAL')}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="AUTO">⚡ AUTO (Instant Vault)</option>
                    <option value="MANUAL">🖐️ MANUAL (Review)</option>
                  </select>
                </div>
              </div>

              {/* Bulk Pricing Tiers */}
              <MobileTierEditor tiers={nTiers} onChange={setNTiers} basePrice={Number(nPrice) || undefined} />

              {/* Initial Vault Accounts (Instant Delivery) */}
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-white flex items-center gap-1">
                      🔐 Delivery Accounts (Optional)
                    </span>
                    <p className="text-[10px] text-slate-400">Pasted accounts are encrypted via AES-256 for instant delivery.</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard.readText();
                          if (txt) {
                            setNAccounts(txt);
                            const count = txt.split('\n').filter((l) => l.trim().length > 0).length;
                            setNStock(String(count));
                            notify(`Pasted ${count} accounts`, 'info');
                          }
                        } catch { notify('Clipboard access denied', 'error'); }
                      }}
                      className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200"
                    >📋 Paste</button>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = 'user1@tzstore.io | SecretPass123\nuser2@tzstore.io | SecretPass456';
                        setNAccounts(sample);
                        setNStock('2');
                        notify('Sample loaded', 'info');
                      }}
                      className="rounded-md border border-purple-500/30 bg-purple-900/30 px-2 py-0.5 text-[10px] text-purple-300"
                    >🧪 Sample</button>
                    {nAccounts && (
                      <button
                        type="button"
                        onClick={() => { setNAccounts(''); setNStock('0'); }}
                        className="text-rose-400 text-[10px] px-1"
                      >Clear</button>
                    )}
                  </div>
                </div>
                <textarea
                  rows={2}
                  placeholder={'Paste accounts (login | password or login:password)...'}
                  value={nAccounts}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNAccounts(val);
                    const count = val.split('\n').filter((l) => l.trim().length > 0).length;
                    if (count > 0) setNStock(String(count));
                  }}
                  className="w-full font-mono rounded-xl bg-slate-950 border border-white/10 p-2 text-[11px] text-white"
                />
                <div className="text-[10px] text-slate-400">
                  {nAccounts.trim() ? (
                    <span className="text-emerald-400 font-semibold">✓ {nAccounts.trim().split('\n').filter((l) => l.trim().length > 0).length} accounts ready for auto-delivery</span>
                  ) : (
                    'No accounts entered (manual stock or fill later)'
                  )}
                </div>
              </div>

              {/* Initial Stock */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Initial Stock</label>
                <input
                  type="number"
                  min="0"
                  value={nStock}
                  onChange={(e) => setNStock(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              {productFormError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2 text-xs text-rose-300">
                  {productFormError}
                </div>
              )}

              <button
                onClick={handleCreateProduct}
                disabled={savingProduct || uploadingPhoto}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 py-3 text-xs font-black text-white shadow-lg transition active:scale-98 disabled:opacity-50"
              >
                {savingProduct ? 'Creating Product…' : '✓ Create & Add Product'}
              </button>
            </div>
          </div>
        )}

        {/* ================= MODAL 2: EDIT PRODUCT (FULL FEATURED) ================= */}
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4">
            <div
              className="w-full max-w-[460px] max-h-[90vh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-3.5 no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <Pencil size={15} className="text-blue-400" /> Edit — {editingProduct.title}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">ID: {editingProduct.id}</p>
                </div>
                <button
                  onClick={() => setEditingProduct(null)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Photo Box */}
              <div className="flex items-center gap-3 rounded-2xl bg-slate-900 border border-white/5 p-3">
                <button
                  type="button"
                  onClick={() => editPhotoFileRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-700 bg-slate-800 p-1"
                >
                  {ePreview ? (
                    <img
                      src={ePreview.startsWith('data:') ? ePreview : tzLogoUrl(ePreview)}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.opacity = '0.3';
                      }}
                    />
                  ) : (
                    <ImagePlus size={22} className="text-slate-400" />
                  )}
                </button>
                <div className="text-xs">
                  <div className="font-bold text-white">Product Photo</div>
                  <input
                    ref={editPhotoFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0], true)}
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => editPhotoFileRef.current?.click()}
                      disabled={eUploading}
                      className="rounded-lg bg-blue-600/20 border border-blue-500/30 px-2 py-1 text-[10px] font-bold text-blue-300"
                    >
                      {eUploading ? 'Uploading…' : 'Change Photo'}
                    </button>
                    {ePreview && (
                      <button
                        type="button"
                        onClick={() => { setEPreview(''); setEPhoto(''); }}
                        className="text-[10px] text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Title</label>
                <input
                  type="text"
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              {/* Category, Price, Priority Serial */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                  <select
                    value={eCat}
                    onChange={(e) => setECat(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2 py-2 text-xs text-white"
                  >
                    {allCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Price (USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ePrice}
                    onChange={(e) => setEPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Priority #</label>
                  <input
                    type="number"
                    min="1"
                    value={eSortOrder}
                    onChange={(e) => setESortOrder(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  rows={2}
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 p-2.5 text-xs text-white"
                />
              </div>

              {/* Bulk Pricing Tiers */}
              <MobileTierEditor tiers={eTiers} onChange={setETiers} basePrice={Number(ePrice) || undefined} />

              {editError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2 text-xs text-rose-300">
                  {editError}
                </div>
              )}

              {/* Buttons: Save & Delete */}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={eSaving || eUploading}
                  className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 text-xs font-bold text-white transition active:scale-98"
                >
                  {eSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => handleDeleteProduct(editingProduct.id)}
                  className="rounded-xl bg-rose-600/20 border border-rose-500/30 px-3 py-3 text-xs font-bold text-rose-300 hover:bg-rose-600/30 active:scale-98"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL 3: DELIVERY VAULT (TELEGRAM MOBILE OPTIMIZED) ================= */}
        {deliveryProduct && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4 animate-in fade-in duration-150"
            onClick={() => setDeliveryProduct(null)}
          >
            <div
              className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[32px] md:rounded-3xl bg-[#0c101d] border border-white/10 p-4 sm:p-5 shadow-2xl space-y-3.5 no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-white/20 shrink-0 cursor-pointer" />
              {renderDeliveryReadyContent(deliveryProduct, () => setDeliveryProduct(null))}
            </div>
          </div>
        )}

        {/* ================= MODAL: EDIT DELIVERY ITEM (DESKTOP PARITY) ================= */}
        {editingVaultRow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-xs p-4">
            <div
              className="w-full max-w-[400px] rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Pencil size={15} className="text-blue-400" /> Edit delivery item
                </h3>
                <button
                  onClick={() => setEditingVaultRow(null)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Login (email / username)</label>
                  <input
                    type="text"
                    value={editVaultLogin}
                    onChange={(e) => setEditVaultLogin(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300">Password</label>
                  <input
                    type="text"
                    value={editVaultPassword}
                    onChange={(e) => setEditVaultPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300">Status</label>
                  <select
                    value={editVaultStatus}
                    onChange={(e) => setEditVaultStatus(e.target.value as any)}
                    className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="SOLD">SOLD</option>
                  </select>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setEditingVaultRow(null)}
                    className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-bold text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveVaultEdit}
                    disabled={savingVaultEdit}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition active:scale-98 disabled:opacity-50"
                  >
                    {savingVaultEdit ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL: CONFIRM DELETE VAULT ITEM ================= */}
        {deletingVaultId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-xs p-4">
            <div
              className="w-full max-w-[360px] rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-3.5 text-center animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                <Trash2 size={24} />
              </div>
              <h3 className="text-sm font-extrabold text-white">Delete Delivery Item?</h3>
              <p className="text-xs text-slate-400">
                This credential set will be deleted from the delivery vault. This action cannot be undone.
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setDeletingVaultId(null)}
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-bold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteVaultItem}
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition active:scale-98"
                >
                  Delete item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= MODAL 4: QUICK RESTOCK COUNTER ================= */}
        {restockProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4">
            <div
              className="w-full max-w-[440px] rounded-t-3xl md:rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white">Quick Restock Stock</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[260px]">{restockProduct.title}</p>
                </div>
                <button
                  onClick={() => setRestockProduct(null)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex items-center justify-center gap-2.5 py-2">
                {[1, 5, 10, 25, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      haptic('light');
                      setRestockQty(amt);
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-extrabold transition active:scale-95 ${
                      restockQty === amt
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>

              <div className="text-center text-xs text-slate-400">
                Current stock: <span className="font-bold text-white">{restockProduct.stock}</span> ➔ New stock:{' '}
                <span className="font-bold text-emerald-400">{Number(restockProduct.stock) + restockQty}</span>
              </div>

              <button
                onClick={handleQuickRestock}
                disabled={isRestocking}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-xs font-black text-white shadow-lg transition active:scale-98 disabled:opacity-50"
              >
                {isRestocking ? 'Updating Stock…' : `Confirm +${restockQty} Units`}
              </button>
            </div>
          </div>
        )}

        {/* ================= MODAL 5: CREATE CATEGORY ================= */}
        {creatingCategory && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4">
            <div
              className="w-full max-w-[440px] rounded-t-3xl md:rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white">Create Category</h3>
                  <p className="text-xs text-slate-400">Add a new department to store catalog</p>
                </div>
                <button
                  onClick={() => setCreatingCategory(false)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. AI Tools or Streaming"
                  value={catNameInput}
                  onChange={(e) => setCatNameInput(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-900 border border-white/10 px-3 py-2 text-xs text-white"
                />
              </div>

              <button
                onClick={handleCreateCategory}
                disabled={savingCategory}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-black text-white shadow-lg transition active:scale-98 disabled:opacity-50"
              >
                {savingCategory ? 'Creating…' : 'Create Category'}
              </button>
            </div>
          </div>
        )}

        {/* ================= MODAL 6: USER PROFILE & WALLET ================= */}
        {selectedUserId && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-xs p-0 md:p-4">
            <div
              className="w-full max-w-[440px] rounded-t-3xl md:rounded-3xl bg-[#0c101d] border border-white/10 p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white">User Profile</h3>
                  <p className="text-xs text-slate-400 font-mono">TG ID: {selectedUserId}</p>
                </div>
                <button
                  onClick={() => setSelectedUserId(null)}
                  className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>

              {userProfile ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-900 p-3.5 border border-white/5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Wallet Balance</div>
                    <div className="text-2xl font-black text-emerald-400 mt-0.5">
                      ${Number(userProfile.walletBalance || 0).toFixed(2)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Total Spent: ${Number(userProfile.totalSpent || 0).toFixed(2)} • Referrals: ${Number(userProfile.referralEarnings || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Adjust Balance */}
                  <div className="rounded-2xl bg-slate-900 p-3 border border-white/5 space-y-2">
                    <div className="text-xs font-bold text-white">Adjust Wallet Balance</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="+/- Amount"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Reason / Note"
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <button
                      onClick={handleAdjustBalance}
                      disabled={adjustingBalance}
                      className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-1.5 text-xs font-bold text-white transition active:scale-98"
                    >
                      {adjustingBalance ? 'Updating…' : 'Apply Balance Adjustment'}
                    </button>
                  </div>

                  {/* Ban / Unban */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBanUser(userProfile.status !== 'BANNED')}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition active:scale-98 ${
                        userProfile.status === 'BANNED'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30'
                      }`}
                    >
                      {userProfile.status === 'BANNED' ? 'Unban User' : 'Ban User'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-6 text-center">Loading user details…</div>
              )}
            </div>
          </div>
        )}

        {/* ================= FIXED TELEGRAM BOTTOM DOCK ================= */}
        <nav
          aria-label="Telegram Operations Mobile Dock"
          className="absolute bottom-0 left-0 right-0 z-40 flex items-center justify-around bg-[#0c101d]/90 backdrop-blur-2xl border-t border-white/5 px-2 py-2"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {[
            { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
            { id: 'products', label: 'Products', Icon: Package },
            { id: 'orders', label: 'Orders', Icon: ReceiptText, badge: pendingOrdersCount },
            { id: 'deposits', label: 'Payments', Icon: CreditCard, badge: pendingDepositsCount },
            { id: 'tools', label: 'Broadcast', Icon: Send },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  haptic('light');
                  setActiveTab(tab.id as any);
                }}
                className={`relative flex flex-1 flex-col items-center justify-center py-1 transition-all active:scale-95 ${
                  isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`relative flex items-center justify-center rounded-2xl px-3 py-1 transition-all ${
                    isActive ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30' : ''
                  }`}
                >
                  <tab.Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {Boolean(tab.badge && tab.badge > 0) && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white shadow-md ring-2 ring-[#0c101d]">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className={`mt-1 text-[10px] leading-none ${isActive ? 'font-extrabold text-white' : 'font-medium'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
