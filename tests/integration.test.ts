import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Route handlers
import { GET as getCategories } from '../app/api/categories/route';
import { GET as getCategoryProducts } from '../app/api/categories/[slug]/products/route';
import { POST as postOrder, GET as getOrder } from '../app/api/orders/route';
import { POST as postPaymentIntent } from '../app/api/payments/intent/route';
import { POST as postCryptoWebhook } from '../app/api/webhooks/crypto/route';
import { POST as postStarsWebhook } from '../app/api/webhooks/stars/route';
import {
  GET as getAdminVault,
  POST as postAdminVault,
  PATCH as patchAdminVault,
  DELETE as deleteAdminVault,
} from '../app/api/admin/vault/route';
import {
  GET as getAdminProducts,
  POST as postAdminProducts,
  DELETE as deleteAdminProducts,
} from '../app/api/admin/products/route';

const TEST_STORE = path.join(process.cwd(), '.data-store.integration-test.json');
const ADMIN_TOKEN = 'test-admin-secret-token-integration';

describe('INTEGRATION TESTS - API ROUTES & END-TO-END FLOWS', { timeout: 25000 }, () => {
  beforeAll(() => {
    process.env.TZ_DATA_STORE = '.data-store.integration-test.json';
    process.env.CODES_ENC_KEY = Buffer.from('abcdef0123456789abcdef0123456789').toString('base64');
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
    process.env.NEXT_PUBLIC_BINANCE_UID = '1134278389';
    process.env.BINANCE_SPOT_API_KEY = '';
    process.env.BINANCE_SPOT_SECRET = '';
  });

  beforeEach(() => {
    try { fs.unlinkSync(TEST_STORE); } catch {}
  });

  afterAll(() => {
    try { fs.unlinkSync(TEST_STORE); } catch {}
    delete process.env.TZ_DATA_STORE;
  });

  // =========================================================================
  // 1. Admin Delivery Item Management (User Request: Edit & Delete Delivery Items)
  // =========================================================================
  describe('Admin Delivery Management Flow (Add -> Edit -> Decrypt -> Delete)', () => {
    it('allows Admin to create product, add delivery items, edit credentials (aaa1/ppppp1), and delete', async () => {
      // Step 1: Admin creates a product via POST /api/admin/products
      const createProdReq = new Request('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({
          title: 'GitHub Student Developer Pack',
          categorySlug: 'github',
          priceUsdt: 10.0,
          desc: '100% verified GitHub student developer accounts',
          stock: 0,
        }),
      });
      const prodRes = await postAdminProducts(createProdReq);
      expect(prodRes.status).toBe(201);
      const prodData = await prodRes.json();
      const productId = prodData.product.id;
      expect(productId).toBeDefined();

      // Step 2: Admin imports delivery vault items via POST /api/admin/vault
      const addVaultReq = new Request('http://localhost:3000/api/admin/vault', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({
          productId,
          login: 'old_login_user',
          password: 'old_plain_password',
        }),
      });
      const vaultRes = await postAdminVault(addVaultReq);
      expect(vaultRes.status).toBe(201);
      const vaultData = await vaultRes.json();
      expect(vaultData.ok).toBe(true);

      // Step 3: Admin inspects the vault item via GET /api/admin/vault?productId=...
      const getVaultReq = new Request(`http://localhost:3000/api/admin/vault?productId=${productId}`, {
        headers: { 'x-admin-token': ADMIN_TOKEN },
      });
      const listRes = await getAdminVault(getVaultReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.available).toBe(1);
      expect(listData.rows.length).toBe(1);
      const deliveryItem = listData.rows[0];
      expect(deliveryItem.login).toBe('old_login_user');
      expect(deliveryItem.password).toBe('old_plain_password');

      // Step 4: Admin Edits delivery item (aaa1 / ppppp1 / AVAILABLE) via PATCH /api/admin/vault
      const patchReq = new Request('http://localhost:3000/api/admin/vault', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({
          id: deliveryItem.id,
          login: 'aaa1',
          password: 'ppppp1',
          status: 'AVAILABLE',
        }),
      });
      const patchRes = await patchAdminVault(patchReq);
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.ok).toBe(true);
      expect(patchData.item.login).toBe('aaa1');
      expect(patchData.item.status).toBe('AVAILABLE');

      // Step 5: Verify the edited item was saved and decrypts to ppppp1
      const verifyReq = new Request(`http://localhost:3000/api/admin/vault?productId=${productId}`, {
        headers: { 'x-admin-token': ADMIN_TOKEN },
      });
      const verifyRes = await getAdminVault(verifyReq);
      const verifyData = await verifyRes.json();
      const updatedItem = verifyData.rows.find((r: any) => r.id === deliveryItem.id);
      expect(updatedItem.login).toBe('aaa1');
      expect(updatedItem.password).toBe('ppppp1');

      // Step 6: Admin deletes the delivery item via DELETE /api/admin/vault
      const deleteVaultReq = new Request('http://localhost:3000/api/admin/vault', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({ id: deliveryItem.id, force: true }),
      });
      const deleteVaultRes = await deleteAdminVault(deleteVaultReq);
      expect(deleteVaultRes.status).toBe(200);
      expect((await deleteVaultRes.json()).ok).toBe(true);

      // Verify delivery item is gone
      const emptyCheckRes = await getAdminVault(verifyReq);
      expect((await emptyCheckRes.json()).available).toBe(0);

      // Step 7: Admin deletes the product via DELETE /api/admin/products
      const deleteProdReq = new Request('http://localhost:3000/api/admin/products', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({ id: productId }),
      });
      const deleteProdRes = await deleteAdminProducts(deleteProdReq);
      expect(deleteProdRes.status).toBe(200);
      expect((await deleteProdRes.json()).ok).toBe(true);
    });
  });

  // =========================================================================
  // 2. Storefront Buying, Checkout & Fulfillment Flow
  // =========================================================================
  describe('Storefront Buying & Crypto Fulfillment E2E Flow', () => {
    it('executes full checkout: Browse category -> Create Order -> Intent (Binance Pay) -> Webhook Fulfill -> Delivery Received', async () => {
      // 1. Setup product with 2 vault items
      const createProdReq = new Request('http://localhost:3000/api/admin/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
        body: JSON.stringify({
          title: 'Telegram Premium 12M',
          categorySlug: 'telegram-premium',
          priceUsdt: 25.0,
          desc: '12 months subscription gift',
          stock: 0,
        }),
      });
      const prodRes = await postAdminProducts(createProdReq);
      const prod = (await prodRes.json()).product;

      await postAdminVault(
        new Request('http://localhost:3000/api/admin/vault', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
          body: JSON.stringify({
            productId: prod.id,
            codes: 'buyer1_acc | secret_pass_1\nbuyer2_acc | secret_pass_2',
          }),
        }),
      );

      // 2. Customer browses category products via GET /api/categories/telegram-premium/products
      const browseReq = new Request('http://localhost:3000/api/categories/telegram-premium/products');
      const browseRes = await getCategoryProducts(browseReq, { params: { slug: 'telegram-premium' } });
      expect(browseRes.status).toBe(200);
      const browseData = await browseRes.json();
      const listedProd = browseData.products.find((p: any) => p.id === prod.id);
      expect(listedProd).toBeDefined();
      expect(listedProd.stock).toBe(2);

      // 3. Customer places order for qty=1 via POST /api/orders
      const orderReq = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: prod.id, qty: 1 }),
      });
      const orderRes = await postOrder(orderReq);
      expect(orderRes.status).toBe(200);
      const order = (await orderRes.json()).order;
      expect(order.id).toBeDefined();
      expect(order.total).toBe(25.0);
      expect(order.status).toBe('PENDING');

      // 4. Customer initiates payment intent with Binance Pay (without requiring user UID)
      const intentReq = new Request('http://localhost:3000/api/payments/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, provider: 'BINANCE' }),
      });
      const intentRes = await postPaymentIntent(intentReq);
      expect(intentRes.status).toBe(200);
      const intentData = await intentRes.json();
      expect(intentData.intent.provider).toBe('BINANCE');
      expect(intentData.intent.address).toBe('1134278389'); // Defaults to store UID

      // 5. Customer initiates TRC20 intent for crypto webhook test
      const cryptoIntentReq = new Request('http://localhost:3000/api/payments/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, provider: 'BEP20' }),
      });
      const cryptoIntentRes = await postPaymentIntent(cryptoIntentReq);
      const cryptoIntent = (await cryptoIntentRes.json()).intent;
      expect(cryptoIntent.amount).toBe(25.0);

      // 6. Payment Webhook arrives with confirmed transaction
      const webhookReq = new Request('http://localhost:3000/api/webhooks/crypto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intentId: cryptoIntent.id,
          txHash: '0x1234567890abcdef',
          amount: 25.0,
        }),
      });
      const webhookRes = await postCryptoWebhook(webhookReq);
      expect(webhookRes.status).toBe(200);
      expect((await webhookRes.json()).ok).toBe(true);

      // 7. Customer checks order status via GET /api/orders?id=...
      const checkOrderReq = new Request(`http://localhost:3000/api/orders?id=${order.id}`);
      const checkOrderRes = await getOrder(checkOrderReq);
      expect(checkOrderRes.status).toBe(200);
      const checkData = await checkOrderRes.json();
      expect(checkData.order.status).toBe('DELIVERED');
      expect(checkData.order.deliveries.length).toBe(1);
      expect(checkData.order.deliveries[0].login).toBe('buyer1_acc');
      expect(checkData.order.deliveries[0].password).toBe('secret_pass_1');

      // 8. Storefront stock is now 1
      const stockAfterReq = new Request('http://localhost:3000/api/categories/telegram-premium/products');
      const stockAfterRes = await getCategoryProducts(stockAfterReq, { params: { slug: 'telegram-premium' } });
      const updatedListedProd = (await stockAfterRes.json()).products.find((p: any) => p.id === prod.id);
      expect(updatedListedProd.stock).toBe(1);
    }, 15000);
  });

  // =========================================================================
  // 3. Security & Validation
  // =========================================================================
  describe('Security & Admin Protection', () => {
    it('blocks unauthorized access to admin endpoints', async () => {
      // 1. GET admin products without token
      const unauthGet = await getAdminProducts(new Request('http://localhost:3000/api/admin/products'));
      expect(unauthGet.status).toBe(401);

      // 2. PATCH admin vault with invalid token
      const invalidTokenPatch = await patchAdminVault(
        new Request('http://localhost:3000/api/admin/vault', {
          method: 'PATCH',
          headers: { 'x-admin-token': 'wrong-token' },
          body: JSON.stringify({ id: 'v-1', login: 'hacked' }),
        }),
      );
      expect(invalidTokenPatch.status).toBe(401);

      // 3. DELETE admin vault without token
      const unauthDelete = await deleteAdminVault(
        new Request('http://localhost:3000/api/admin/vault', {
          method: 'DELETE',
          body: JSON.stringify({ id: 'v-1' }),
        }),
      );
      expect(unauthDelete.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. Crypto Webhooks: Underpayment and Deduplication
  // =========================================================================
  describe('Webhook Edge Cases: Underpayment & Idempotence', () => {
    it('flags underpayment as NEEDS_REVIEW and deduplicates repeated webhook events', async () => {
      // Create product and order
      const prodRes = await postAdminProducts(
        new Request('http://localhost:3000/api/admin/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
          body: JSON.stringify({
            title: 'Underpay Product Test',
            categorySlug: 'tz-vip',
            priceUsdt: 100.0,
            stock: 10,
          }),
        }),
      );
      const prod = (await prodRes.json()).product;

      const orderRes = await postOrder(
        new Request('http://localhost:3000/api/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: prod.id, qty: 1 }),
        }),
      );
      const order = (await orderRes.json()).order;

      const intentRes = await postPaymentIntent(
        new Request('http://localhost:3000/api/payments/intent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, provider: 'BEP20' }),
        }),
      );
      const intent = (await intentRes.json()).intent;

      // 1. Underpayment Webhook ($99.00 instead of $100.00)
      const underpayRes = await postCryptoWebhook(
        new Request('http://localhost:3000/api/webhooks/crypto', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intentId: intent.id,
            txHash: '0xunderpay_hash_123',
            amount: 99.0,
          }),
        }),
      );
      expect(underpayRes.status).toBe(200);
      const underpayData = await underpayRes.json();
      expect(underpayData.review).toBe(true);

      // Order status is NEEDS_REVIEW
      const checkRes = await getOrder(new Request(`http://localhost:3000/api/orders?id=${order.id}`));
      expect((await checkRes.json()).order.status).toBe('NEEDS_REVIEW');

      // 2. Duplicate Webhook: Send exact same txHash again
      const dupRes = await postCryptoWebhook(
        new Request('http://localhost:3000/api/webhooks/crypto', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            intentId: intent.id,
            txHash: '0xunderpay_hash_123',
            amount: 99.0,
          }),
        }),
      );
      expect(dupRes.status).toBe(200);
      const dupData = await dupRes.json();
      expect(dupData.deduped).toBe(true);
    });
  });
});
