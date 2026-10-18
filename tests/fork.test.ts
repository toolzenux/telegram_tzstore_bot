import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../lib/store';
import { vaultEncrypt } from '../lib/vault-crypto';
import { fulfillOrder } from '../lib/fulfill';

const FORK_STORE_FILE = path.join(process.cwd(), '.data-store.fork-test.json');

describe('FORK TESTS - CONCURRENCY, BRANCHING & STATE ISOLATION', () => {
  beforeAll(() => {
    process.env.TZ_DATA_STORE = '.data-store.fork-test.json';
    process.env.CODES_ENC_KEY = Buffer.from('abcdef0123456789abcdef0123456789').toString('base64');
  });

  beforeEach(() => {
    try { fs.unlinkSync(FORK_STORE_FILE); } catch {}
  });

  afterAll(() => {
    try { fs.unlinkSync(FORK_STORE_FILE); } catch {}
    delete process.env.TZ_DATA_STORE;
  });

  // ==========================================
  // Fork 1: Concurrent Stock Claiming Race Condition
  // ==========================================
  describe('Concurrency Fork: Race conditions & zero double-selling', () => {
    it('prevents double-selling when multiple concurrent requests compete for limited stock', async () => {
      const p = store.addProduct({
        title: 'Limited License Key',
        categorySlug: 'tz-vip',
        priceUsdt: 10.0,
      });

      // Stock is strictly 3 accounts
      store.vaultAdd(p.id, [
        { login: 'license-1@store.com', passwordEnc: vaultEncrypt('p1') },
        { login: 'license-2@store.com', passwordEnc: vaultEncrypt('p2') },
        { login: 'license-3@store.com', passwordEnc: vaultEncrypt('p3') },
      ]);
      expect(store.vaultAvailable(p.id)).toBe(3);

      // Create 8 concurrent orders competing for 1 license each
      const orderIds = Array.from({ length: 8 }, (_, i) => `ord_concurrent_${i + 1}`);
      for (const id of orderIds) {
        store.createOrder({
          id,
          userTg: `user_${id}`,
          productId: p.id,
          qty: 1,
          unitPrice: 10.0,
          total: 10.0,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        });
      }

      // Execute fulfillment for all 8 orders simultaneously
      const results = await Promise.all(orderIds.map((id) => fulfillOrder(id)));

      const deliveredCount = results.filter((r) => r.status === 'DELIVERED').length;
      const needsReviewCount = results.filter((r) => r.status === 'NEEDS_REVIEW').length;

      // Exactly 3 must be delivered, exactly 5 must be flagged NEEDS_REVIEW
      expect(deliveredCount).toBe(3);
      expect(needsReviewCount).toBe(5);

      // Available inventory must now be 0
      expect(store.vaultAvailable(p.id)).toBe(0);

      // Verify that every delivered login is distinct (no account delivered twice)
      const deliveredLogins = results
        .filter((r) => r.status === 'DELIVERED')
        .flatMap((r) => r.deliveries?.map((d) => d.login) ?? []);
      const uniqueLogins = new Set(deliveredLogins);
      expect(uniqueLogins.size).toBe(3);
    }, 30000);
  });

  // ==========================================
  // Fork 2: Order Lifecycle Branching Forks
  // ==========================================
  describe('Lifecycle Forks: Branching state paths', () => {
    it('Branch A (Happy Path): PENDING -> PAID -> DELIVERED with decrypted account', async () => {
      const p = store.addProduct({
        title: 'Happy Path Account',
        categorySlug: 'telegram-premium',
        priceUsdt: 5.0,
      });
      store.vaultAdd(p.id, [{ login: 'happy@buyer.com', passwordEnc: vaultEncrypt('pwd123') }]);

      const order = store.createOrder({
        id: 'ord_happy_path',
        userTg: 'buyer_tg',
        productId: p.id,
        qty: 1,
        unitPrice: 5.0,
        total: 5.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      const res = await fulfillOrder(order.id);
      expect(res.status).toBe('DELIVERED');
      expect(res.deliveries?.[0].login).toBe('happy@buyer.com');
      expect(res.deliveries?.[0].password).toBe('pwd123');

      // Stock is reduced
      expect(store.vaultAvailable(p.id)).toBe(0);
    });

    it('Branch B (Cancellation Fork): PENDING -> CANCELLED -> Vault stock untouched', async () => {
      const p = store.addProduct({
        title: 'Cancel Branch Account',
        categorySlug: 'telegram-premium',
        priceUsdt: 5.0,
      });
      store.vaultAdd(p.id, [{ login: 'cancel@buyer.com', passwordEnc: vaultEncrypt('pwd') }]);

      const order = store.createOrder({
        id: 'ord_cancel_path',
        userTg: 'buyer_tg',
        productId: p.id,
        qty: 1,
        unitPrice: 5.0,
        total: 5.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      // User cancels checkout
      store.setOrderStatus(order.id, 'CANCELLED');
      const fulfillRes = await fulfillOrder(order.id);

      // fulfillOrder must NOT deliver a cancelled order
      expect(fulfillRes.status).toBe('CANCELLED');
      expect(store.getOrder(order.id)?.status).toBe('CANCELLED');
      // Stock remains AVAILABLE for next buyer
      expect(store.vaultAvailable(p.id)).toBe(1);
    });

    it('Branch C (Refund Fork): DELIVERED -> Refunded -> Vault returned to AVAILABLE', async () => {
      const p = store.addProduct({
        title: 'Refund Branch Account',
        categorySlug: 'telegram-premium',
        priceUsdt: 5.0,
      });
      store.vaultAdd(p.id, [{ login: 'refund_me@buyer.com', passwordEnc: vaultEncrypt('pwd') }]);

      const order = store.createOrder({
        id: 'ord_refund_path',
        userTg: 'buyer_tg',
        productId: p.id,
        qty: 1,
        unitPrice: 5.0,
        total: 5.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      // 1. Order delivered
      await fulfillOrder(order.id);
      expect(store.vaultAvailable(p.id)).toBe(0);

      // 2. Admin refunds the order
      store.setOrderStatus(order.id, 'REFUNDED');
      const released = store.vaultReleaseByOrder(order.id);
      expect(released).toBe(1);

      // 3. Vault item is available again
      expect(store.vaultAvailable(p.id)).toBe(1);
      const row = store.vaultList(p.id)[0];
      expect(row.status).toBe('AVAILABLE');
      expect(row.orderId).toBeNull();
    });

    it('Branch D (Out-Of-Stock Fork): Order fails -> Admin restocks -> Order fulfills', async () => {
      const p = store.addProduct({
        title: 'Restock Flow Item',
        categorySlug: 'telegram-premium',
        priceUsdt: 2.0,
      });
      // Vault has 1 item
      store.vaultAdd(p.id, [{ login: 'item1', passwordEnc: vaultEncrypt('p1') }]);

      // Buyer 1 takes it
      const ord1 = store.createOrder({
        id: 'ord_buyer1',
        userTg: 'user1',
        productId: p.id,
        qty: 1,
        unitPrice: 2.0,
        total: 2.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      await fulfillOrder(ord1.id);
      expect(store.vaultAvailable(p.id)).toBe(0);

      // Buyer 2 tries to order 1 item -> vault is empty
      const ord2 = store.createOrder({
        id: 'ord_buyer2',
        userTg: 'user2',
        productId: p.id,
        qty: 1,
        unitPrice: 2.0,
        total: 2.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      const resShort = await fulfillOrder(ord2.id);
      expect(resShort.status).toBe('NEEDS_REVIEW');

      // Admin adds more stock
      store.vaultAdd(p.id, [{ login: 'item2', passwordEnc: vaultEncrypt('p2') }]);
      expect(store.vaultAvailable(p.id)).toBe(1);

      // Admin re-triggers fulfillment for ord2
      const resRetry = await fulfillOrder(ord2.id);
      expect(resRetry.status).toBe('DELIVERED');
      expect(resRetry.deliveries?.[0].login).toBe('item2');
      expect(store.vaultAvailable(p.id)).toBe(0);
    });

    it('Branch E (Partial Inventory Fork): Requesting 3 when 2 are available preserves all 2', async () => {
      const p = store.addProduct({
        title: 'Partial Inventory Item',
        categorySlug: 'telegram-premium',
        priceUsdt: 1.0,
      });
      store.vaultAdd(p.id, [
        { login: 'acc1', passwordEnc: vaultEncrypt('p1') },
        { login: 'acc2', passwordEnc: vaultEncrypt('p2') },
      ]);
      expect(store.vaultAvailable(p.id)).toBe(2);

      const ord = store.createOrder({
        id: 'ord_greedy',
        userTg: 'greedy_user',
        productId: p.id,
        qty: 3, // Asks for 3, only 2 exist
        unitPrice: 1.0,
        total: 3.0,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });

      const res = await fulfillOrder(ord.id);
      expect(res.status).toBe('NEEDS_REVIEW');

      // Crucial: The 2 existing items MUST NOT be partially claimed
      expect(store.vaultAvailable(p.id)).toBe(2);
    });
  });

  // ==========================================
  // Fork 3: State Clones & Independent Environments
  // ==========================================
  describe('State Isolation Fork', () => {
    it('isolates operations when using separate store files', () => {
      const fileA = path.join(process.cwd(), '.data-store.fork-A.json');
      const fileB = path.join(process.cwd(), '.data-store.fork-B.json');
      try {
        process.env.TZ_DATA_STORE = '.data-store.fork-A.json';
        store.addProduct({ title: 'Product In A', categorySlug: 'tz-vip', priceUsdt: 10 });
        expect(store.allProducts().some((p) => p.title === 'Product In A')).toBe(true);

        process.env.TZ_DATA_STORE = '.data-store.fork-B.json';
        expect(store.allProducts().some((p) => p.title === 'Product In A')).toBe(false);
      } finally {
        try { fs.unlinkSync(fileA); } catch {}
        try { fs.unlinkSync(fileB); } catch {}
        process.env.TZ_DATA_STORE = '.data-store.fork-test.json';
      }
    });
  });
});
