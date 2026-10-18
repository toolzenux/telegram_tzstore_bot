import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { vaultEncrypt, vaultDecrypt } from '../lib/vault-crypto';
import { store } from '../lib/store';
import { fulfillOrder } from '../lib/fulfill';
import { newId, starsFor, demoAddress, createStarsInvoiceLink } from '../lib/payments';
import { roleFor, signSession, verifySession, sessionFromRequest } from '../lib/auth';
import { requireAdminToken } from '../lib/admin-auth';
import { validateInitData, parseStartParam } from '../lib/telegram';
import { checkTxidOnBinance } from '../lib/binance-check';
import { unitPriceFor, PRODUCTS, CATEGORIES } from '../lib/seed-data';
import { slugOf } from '../lib/admin-api';

const TEST_STORE_FILE = path.join(process.cwd(), '.data-store.unit-test.json');

describe('UNIT TESTS - ALL FUNCTIONS', () => {
  beforeAll(() => {
    process.env.TZ_DATA_STORE = '.data-store.unit-test.json';
    process.env.CODES_ENC_KEY = Buffer.from('01234567890123456789012345678901').toString('base64');
    process.env.JWT_SECRET = 'unit-test-secret-must-be-long-enough-32bytes';
    process.env.ADMIN_TG_IDS = '12345,67890';
    process.env.ADMIN_API_TOKEN = 'test-admin-secret-token-123';
  });

  beforeEach(() => {
    try { fs.unlinkSync(TEST_STORE_FILE); } catch {}
  });

  afterAll(() => {
    try { fs.unlinkSync(TEST_STORE_FILE); } catch {}
    delete process.env.TZ_DATA_STORE;
  });

  // ==========================================
  // 1. Vault Crypto (lib/vault-crypto.ts)
  // ==========================================
  describe('vault-crypto', () => {
    it('encrypts and decrypts with AES-256-GCM successfully', () => {
      const plaintext = 'SuperSecretP@ssw0rd!_123';
      const encrypted = vaultEncrypt(plaintext);
      expect(encrypted).toMatch(/^gcm:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
      const decrypted = vaultDecrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('falls back to plain: prefix when CODES_ENC_KEY is missing', () => {
      const oldKey = process.env.CODES_ENC_KEY;
      delete process.env.CODES_ENC_KEY;
      try {
        const encrypted = vaultEncrypt('plainPassword');
        expect(encrypted).toBe('plain:plainPassword');
        const decrypted = vaultDecrypt(encrypted);
        expect(decrypted).toBe('plainPassword');
      } finally {
        process.env.CODES_ENC_KEY = oldKey;
      }
    });

    it('handles corrupted ciphertext gracefully without crashing', () => {
      const corrupted = 'gcm:YWJj:YWJj:YWJj'; // invalid base64 / length
      const res = vaultDecrypt(corrupted);
      expect(res).toBe(corrupted);
    });

    it('handles non-GCM plain strings gracefully', () => {
      expect(vaultDecrypt('some-legacy-string')).toBe('some-legacy-string');
    });
  });

  // ==========================================
  // 2. Data Store (lib/store.ts)
  // ==========================================
  describe('store - Categories', () => {
    it('lists categories and defaults to seeded categories', () => {
      const cats = store.listCats();
      expect(cats.length).toBeGreaterThanOrEqual(CATEGORIES.length);
      expect(cats.some((c) => c.slug === 'telegram-premium')).toBe(true);
    });

    it('adds a new category with sanitized slug and retrieves it', () => {
      const created = store.addCategory('  Gaming Accounts & VPN  ');
      expect(created.slug).toBe('gaming-accounts-vpn');
      expect(created.name).toBe('Gaming Accounts & VPN');
      const cats = store.listCats();
      expect(cats.some((c) => c.slug === 'gaming-accounts-vpn')).toBe(true);
    });

    it('rejects adding category with invalid name', () => {
      expect(() => store.addCategory('   ')).toThrow('bad name');
    });

    it('reorders categories according to custom order', () => {
      store.addCategory('Custom Alpha');
      store.addCategory('Custom Beta');
      store.reorderCats(['custom-beta', 'custom-alpha']);
      const cats = store.listCats();
      const idxBeta = cats.findIndex((c) => c.slug === 'custom-beta');
      const idxAlpha = cats.findIndex((c) => c.slug === 'custom-alpha');
      expect(idxBeta).toBeLessThan(idxAlpha);
    });

    it('deletes custom category and prevents deleting built-in categories', () => {
      store.addCategory('Temporary Cat');
      expect(() => store.deleteCategory('telegram-premium')).toThrow('built-in categories cannot be deleted');
      store.deleteCategory('temporary-cat');
      expect(store.listCats().some((c) => c.slug === 'temporary-cat')).toBe(false);
    });
  });

  describe('store - Products', () => {
    it('adds a custom product and retrieves it', () => {
      const p = store.addProduct({
        title: 'NordVPN 1 Year',
        categorySlug: 'telegram-premium',
        priceUsdt: 4.5,
        desc: 'Fast and secure VPN',
        stock: 10,
      });
      expect(p.id).toMatch(/^p-custom-/);
      expect(p.title).toBe('NordVPN 1 Year');
      expect(p.priceUsdt).toBe(4.5);

      const found = store.getProduct(p.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('NordVPN 1 Year');
      expect(found?.stock).toBe(10);
      expect(found?.status).toBe('ACTIVE');
    });

    it('updates product fields and category', () => {
      const p = store.addProduct({
        title: 'Old Title',
        categorySlug: 'telegram-premium',
        priceUsdt: 2.0,
      });
      store.updateProduct(p.id, {
        title: 'New Title',
        desc: 'New Description',
        logo: '/logos/custom.svg',
      });
      const updated = store.getProduct(p.id);
      expect(updated?.title).toBe('New Title');
      expect(updated?.desc).toBe('New Description');
      expect(updated?.logo).toBe('/logos/custom.svg');
    });

    it('updates price override and stock override', () => {
      const p = store.addProduct({
        title: 'Test Override',
        categorySlug: 'telegram-premium',
        priceUsdt: 5.0,
        stock: 5,
      });
      store.setPrice(p.id, 7.5);
      store.addStock(p.id, 10);

      const updated = store.getProduct(p.id);
      expect(updated?.priceUsdt).toBe(7.5);
      expect(updated?.stock).toBe(15);
    });

    it('deletes a product and cleans up vault items', () => {
      const p = store.addProduct({
        title: 'Product To Delete',
        categorySlug: 'telegram-premium',
        priceUsdt: 1.0,
      });
      store.vaultAdd(p.id, [{ login: 'del_user', passwordEnc: vaultEncrypt('del_pass') }]);
      expect(store.vaultAvailable(p.id)).toBe(1);

      store.deleteProduct(p.id);
      expect(store.getProduct(p.id)).toBeUndefined();
      expect(store.vaultAvailable(p.id)).toBe(0);
    });

    it('respects product serial/priority ordering and reordering', () => {
      const p1 = store.addProduct({
        title: 'Priority Product A',
        categorySlug: 'telegram-premium',
        priceUsdt: 2.0,
        sortOrder: 10,
      });
      const p2 = store.addProduct({
        title: 'Priority Product B',
        categorySlug: 'telegram-premium',
        priceUsdt: 3.0,
        sortOrder: 5,
      });
      const p3 = store.addProduct({
        title: 'Priority Product C',
        categorySlug: 'telegram-premium',
        priceUsdt: 4.0,
        sortOrder: 1,
      });

      // Fetch products for category
      const list = store.listProducts('telegram-premium');
      const idxA = list.findIndex((x) => x.id === p1.id);
      const idxB = list.findIndex((x) => x.id === p2.id);
      const idxC = list.findIndex((x) => x.id === p3.id);

      // p3 (sortOrder 1) must come before p2 (sortOrder 5), and p2 before p1 (sortOrder 10)
      expect(idxC).toBeLessThan(idxB);
      expect(idxB).toBeLessThan(idxA);

      // Update sort order directly
      store.updateProduct(p1.id, { sortOrder: 2 });
      const updatedList = store.listProducts('telegram-premium');
      const newIdxA = updatedList.findIndex((x) => x.id === p1.id);
      const newIdxB = updatedList.findIndex((x) => x.id === p2.id);
      const newIdxC = updatedList.findIndex((x) => x.id === p3.id);

      // Now p3 (1) < p1 (2) < p2 (5)
      expect(newIdxC).toBeLessThan(newIdxA);
      expect(newIdxA).toBeLessThan(newIdxB);

      // Bulk reorder
      store.reorderProducts([p2.id, p1.id, p3.id]);
      expect(store.getProduct(p2.id)?.sortOrder).toBe(1);
      expect(store.getProduct(p1.id)?.sortOrder).toBe(2);
      expect(store.getProduct(p3.id)?.sortOrder).toBe(3);

      const reorderedList = store.listProducts('telegram-premium');
      const finalIdxA = reorderedList.findIndex((x) => x.id === p1.id);
      const finalIdxB = reorderedList.findIndex((x) => x.id === p2.id);
      const finalIdxC = reorderedList.findIndex((x) => x.id === p3.id);
      expect(finalIdxB).toBeLessThan(finalIdxA);
      expect(finalIdxA).toBeLessThan(finalIdxC);
    });
  });

  describe('store - Vault Delivery Accounts', () => {
    it('manages vault delivery items: add, list, update, and delete', () => {
      const p = store.addProduct({
        title: 'GitHub Pro Test',
        categorySlug: 'github',
        priceUsdt: 9.99,
        stock: 0,
      });

      // 1. Add delivery vault items
      store.vaultAdd(p.id, [
        { login: 'user1@example.com', passwordEnc: vaultEncrypt('pwd1') },
        { login: 'user2@example.com', passwordEnc: vaultEncrypt('pwd2') },
      ]);
      expect(store.vaultHas(p.id)).toBe(true);
      expect(store.vaultAvailable(p.id)).toBe(2);

      // Stock should automatically equal available vault items
      const prod = store.getProduct(p.id);
      expect(prod?.stock).toBe(2);

      // 2. List vault items (passwords decrypted)
      const list = store.vaultList(p.id);
      expect(list.length).toBe(2);
      expect(list[0].login).toBe('user1@example.com');
      expect(list[0].password).toBe('pwd1');
      expect(list[0].status).toBe('AVAILABLE');

      // 3. Update/Edit delivery item (user request: login aaa1, password ppppp1)
      const itemToEdit = list[0];
      const updatedItem = store.vaultUpdate(itemToEdit.id, {
        login: 'aaa1',
        password: 'ppppp1',
        status: 'AVAILABLE',
      });
      expect(updatedItem.login).toBe('aaa1');

      const recheckedList = store.vaultList(p.id);
      const edited = recheckedList.find((v) => v.id === itemToEdit.id);
      expect(edited?.login).toBe('aaa1');
      expect(edited?.password).toBe('ppppp1');

      // 4. Delete delivery item
      store.vaultDelete(itemToEdit.id);
      expect(store.vaultAvailable(p.id)).toBe(1);
    });

    it('atomically claims vault items with vaultTake and releases with vaultReleaseByOrder', () => {
      const p = store.addProduct({
        title: 'Atomic Vault Item',
        categorySlug: 'telegram-premium',
        priceUsdt: 5.0,
      });

      store.vaultAdd(p.id, [
        { login: 'acc1', passwordEnc: vaultEncrypt('pass1') },
        { login: 'acc2', passwordEnc: vaultEncrypt('pass2') },
        { login: 'acc3', passwordEnc: vaultEncrypt('pass3') },
      ]);
      expect(store.vaultAvailable(p.id)).toBe(3);

      // Order claims 2 items
      const taken = store.vaultTake(p.id, 2, 'order_123');
      expect(taken).not.toBeNull();
      expect(taken?.length).toBe(2);
      expect(taken?.[0].password).toBe('pass1');
      expect(taken?.[1].password).toBe('pass2');
      expect(store.vaultAvailable(p.id)).toBe(1);

      // Trying to take 2 more when only 1 is available should return null (all or nothing)
      const failedTake = store.vaultTake(p.id, 2, 'order_999');
      expect(failedTake).toBeNull();
      expect(store.vaultAvailable(p.id)).toBe(1);

      // Releasing order_123 returns claimed items back to AVAILABLE
      const releasedCount = store.vaultReleaseByOrder('order_123');
      expect(releasedCount).toBe(2);
      expect(store.vaultAvailable(p.id)).toBe(3);
    });
  });

  describe('store - Orders & Intents', () => {
    it('creates, retrieves, and updates orders and intents', () => {
      const order = store.createOrder({
        id: 'ord_test_1',
        userTg: '12345',
        productId: 'p-gemini-18m',
        qty: 1,
        unitPrice: 0.75,
        total: 0.75,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      expect(order.id).toBe('ord_test_1');

      const retrieved = store.getOrder('ord_test_1');
      expect(retrieved?.userTg).toBe('12345');

      store.setOrderStatus('ord_test_1', 'PAID');
      expect(store.getOrder('ord_test_1')?.status).toBe('PAID');

      store.setOrderDeliveries('ord_test_1', [{ login: 'user@gemini', password: 'pwd' }]);
      expect(store.getOrder('ord_test_1')?.deliveries?.[0].login).toBe('user@gemini');

      const userOrders = store.myOrders('12345');
      expect(userOrders.length).toBe(1);
      expect(userOrders[0].id).toBe('ord_test_1');

      // Intent
      const intent = store.createIntent({
        id: 'it_test_1',
        orderId: 'ord_test_1',
        provider: 'BINANCE',
        asset: 'USDT',
        amount: 0.75,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
      });
      expect(intent.id).toBe('it_test_1');
      expect(store.getIntent('it_test_1')?.provider).toBe('BINANCE');

      store.setIntent('it_test_1', { status: 'FULFILLED', txHash: '0xabc123' });
      expect(store.getIntent('it_test_1')?.status).toBe('FULFILLED');
      expect(store.getIntent('it_test_1')?.txHash).toBe('0xabc123');
    });
  });

  describe('store - Notifications & Restocks', () => {
    it('manages restock notifications and logs', () => {
      store.addNotif('tg_user_1', 'p-capcut-1m');
      store.addNotif('tg_user_1', 'p-capcut-1m'); // duplicate should be ignored

      store.addRestock({
        id: 'restock_new_1',
        productId: 'p-capcut-1m',
        qty: 50,
        message: 'CapCut restocked!',
        createdAt: new Date().toISOString(),
      });
      const restocks = store.restocks();
      expect(restocks[0].id).toBe('restock_new_1');
    });
  });

  // ==========================================
  // 3. Fulfill Workflow (lib/fulfill.ts)
  // ==========================================
  describe('fulfillOrder', () => {
    it('fulfills order with vault items and updates order and intent', async () => {
      const p = store.addProduct({
        title: 'Auto Fulfill Test',
        categorySlug: 'telegram-premium',
        priceUsdt: 1.0,
      });
      store.vaultAdd(p.id, [
        { login: 'auto_login', passwordEnc: vaultEncrypt('auto_pass') },
      ]);

      const o = store.createOrder({
        id: 'ord_fulfill_1',
        userTg: '12345',
        productId: p.id,
        qty: 1,
        unitPrice: 1.0,
        total: 1.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      store.createIntent({
        id: 'it_fulfill_1',
        orderId: o.id,
        provider: 'BINANCE',
        asset: 'USDT',
        amount: 1.0,
        status: 'PENDING',
        expiresAt: new Date().toISOString(),
      });

      const res = await fulfillOrder(o.id);
      expect(res.status).toBe('DELIVERED');
      expect(res.deliveries?.[0].login).toBe('auto_login');
      expect(res.deliveries?.[0].password).toBe('auto_pass');

      const completedOrder = store.getOrder(o.id);
      expect(completedOrder?.status).toBe('DELIVERED');
      expect(completedOrder?.deliveries?.[0].login).toBe('auto_login');

      const completedIntent = store.getIntent('it_fulfill_1');
      expect(completedIntent?.status).toBe('FULFILLED');

      // Idempotence check: Calling fulfillOrder on already DELIVERED returns same deliveries without error
      const secondCall = await fulfillOrder(o.id);
      expect(secondCall.status).toBe('DELIVERED');
      expect(secondCall.deliveries?.[0].login).toBe('auto_login');
    });

    it('sets order to NEEDS_REVIEW when vault stock is insufficient', async () => {
      const p = store.addProduct({
        title: 'OOS Fulfill Test',
        categorySlug: 'telegram-premium',
        priceUsdt: 1.0,
      });
      // Add 1 vault item, but order requires 2 units
      store.vaultAdd(p.id, [{ login: 'only_one', passwordEnc: vaultEncrypt('pwd') }]);

      const o = store.createOrder({
        id: 'ord_fulfill_oos',
        userTg: '12345',
        productId: p.id,
        qty: 2,
        unitPrice: 1.0,
        total: 2.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      const res = await fulfillOrder(o.id);
      expect(res.status).toBe('NEEDS_REVIEW');
      expect(store.getOrder(o.id)?.status).toBe('NEEDS_REVIEW');
    }, 15000);

    it('generates legacy voucher code for products without vault', async () => {
      const o = store.createOrder({
        id: 'ord_legacy_code',
        userTg: '12345',
        productId: 'legacy-no-vault-product',
        qty: 1,
        unitPrice: 1.0,
        total: 1.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      const res = await fulfillOrder(o.id);
      expect(res.status).toBe('DELIVERED');
      const order = store.getOrder(o.id);
      expect(order?.code).toMatch(/^EM-[A-Z0-9_]+-[A-Z0-9]+$/);
    });
  });

  // ==========================================
  // 4. Payments (lib/payments.ts)
  // ==========================================
  describe('payments helper functions', () => {
    it('generates IDs with expected prefix and hex randomness', () => {
      const id1 = newId('it');
      const id2 = newId('ord');
      expect(id1).toMatch(/^it_[0-9a-f]{16}$/);
      expect(id2).toMatch(/^ord_[0-9a-f]{16}$/);
      expect(id1).not.toBe(newId('it'));
    });

    it('calculates Telegram Stars accurately at rate 70', () => {
      expect(starsFor(1)).toBe(70);
      expect(starsFor(4.2)).toBe(294);
      expect(starsFor(0.01)).toBe(1); // Math.max(1, ...)
    });

    it('generates demo crypto addresses for supported networks', () => {
      expect(demoAddress('TRC20', 'intent_12345678')).toBe('TEmStoreDemoTRC2012345678');
      expect(demoAddress('BEP20', 'intent_12345678')).toBe('0x620b6207d03e59ccf1d1356f78a4f8e9078cf711');
      expect(demoAddress('BTC', 'intent_12345678')).toBe('bc1qemstoredemo12345678');
      expect(demoAddress('STARS', 'intent_12345678')).toBeUndefined();
      expect(demoAddress('BINANCE', 'intent_12345678')).toBeUndefined();
    });

    it('creates stars invoice link in dev mode when BOT_TOKEN is empty', async () => {
      const orig = process.env.BOT_TOKEN;
      process.env.BOT_TOKEN = '';
      try {
        const link = await createStarsInvoiceLink('Test Title', 'test_payload', 100);
        expect(link).toBe('https://t.me/invoice/dev_test_payload');
      } finally {
        process.env.BOT_TOKEN = orig;
      }
    });
  });

  // ==========================================
  // 5. Authentication & Telegram (lib/auth.ts, lib/admin-auth.ts, lib/telegram.ts)
  // ==========================================
  describe('auth and tokens', () => {
    it('correctly assigns ADMIN or USER role based on ADMIN_TG_IDS', () => {
      expect(roleFor('12345')).toBe('ADMIN');
      expect(roleFor('67890')).toBe('ADMIN');
      expect(roleFor('99999')).toBe('USER');
    });

    it('signs and verifies JWT sessions', () => {
      const token = signSession({ tgId: '12345', username: 'admin_user', role: 'ADMIN' });
      const decoded = verifySession(token);
      expect(decoded?.tgId).toBe('12345');
      expect(decoded?.role).toBe('ADMIN');

      expect(verifySession('invalid-token')).toBeNull();
    });

    it('extracts session from request Authorization header', () => {
      const token = signSession({ tgId: '54321', role: 'USER' });
      const req = new Request('http://localhost:3000/api/orders', {
        headers: { authorization: `Bearer ${token}` },
      });
      const session = sessionFromRequest(req);
      expect(session?.tgId).toBe('54321');
      expect(session?.role).toBe('USER');

      const unauthReq = new Request('http://localhost:3000/api/orders');
      expect(sessionFromRequest(unauthReq)).toBeNull();
    });

    it('guards admin routes with requireAdminToken', () => {
      // 1. Missing token header -> 401
      const noTokenReq = new Request('http://localhost:3000/api/admin/vault');
      const res1 = requireAdminToken(noTokenReq);
      expect(res1?.status).toBe(401);

      // 2. Incorrect token header -> 401
      const badTokenReq = new Request('http://localhost:3000/api/admin/vault', {
        headers: { 'x-admin-token': 'wrong-token' },
      });
      const res2 = requireAdminToken(badTokenReq);
      expect(res2?.status).toBe(401);

      // 3. Correct token header -> null (pass)
      const goodTokenReq = new Request('http://localhost:3000/api/admin/vault', {
        headers: { 'x-admin-token': 'test-admin-secret-token-123' },
      });
      const res3 = requireAdminToken(goodTokenReq);
      expect(res3).toBeNull();
    });

    it('validates Telegram Mini App initData HMAC signatures', () => {
      const botToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
      const userObj = { id: 7777777, first_name: 'John', username: 'johnny' };
      const authDate = Math.floor(Date.now() / 1000);

      const params = new Map<string, string>([
        ['auth_date', String(authDate)],
        ['user', JSON.stringify(userObj)],
      ]);
      const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

      const rawInitData = `auth_date=${authDate}&user=${encodeURIComponent(JSON.stringify(userObj))}&hash=${hash}`;

      const validResult = validateInitData(rawInitData, botToken);
      expect(validResult.ok).toBe(true);
      expect(validResult.user?.id).toBe(7777777);

      // Tampered data should fail
      const badResult = validateInitData(rawInitData + 'tampered', botToken);
      expect(badResult.ok).toBe(false);
    });

    it('parses start_param from initData', () => {
      expect(parseStartParam('start_param=product_p-gemini-18m&hash=xyz')).toBe('product_p-gemini-18m');
      expect(parseStartParam('startapp=order_12345&hash=xyz')).toBe('order_12345');
      expect(parseStartParam('')).toBeNull();
    });
  });

  // ==========================================
  // 6. Binance Check (lib/binance-check.ts)
  // ==========================================
  describe('checkTxidOnBinance', () => {
    it('returns no-keys when API credentials are not set', async () => {
      const oldKey = process.env.BINANCE_SPOT_API_KEY;
      delete process.env.BINANCE_SPOT_API_KEY;
      try {
        const res = await checkTxidOnBinance('some_txid_123');
        expect(res.state).toBe('no-keys');
        expect(res.reason).toContain('Auto-check not configured');
      } finally {
        if (oldKey) process.env.BINANCE_SPOT_API_KEY = oldKey;
      }
    });
  });
});
