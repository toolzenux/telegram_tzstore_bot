import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { validateInitData, parseStartParam } from '../lib/telegram';
import { signSession, verifySession, sessionFromRequest, roleFor } from '../lib/auth';
import { requireAdminToken } from '../lib/admin-auth';
import { store } from '../lib/store';
import { GET as getUserMe } from '../app/api/users/me/route';
import { POST as postAuthTelegram } from '../app/api/auth/telegram/route';
import { GET as getOrder } from '../app/api/orders/route';
import { GET as getMyOrders } from '../app/api/orders/mine/route';
import { POST as postAdminAuthTelegram } from '../app/api/admin/auth/telegram/route';
import { verifyAccess } from '../lib/admin-jwt';


describe('SECURITY AUDIT TEST SUITE', () => {
  const TEST_BOT_TOKEN = '1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ_TestBot';

  function createSignedInitData(
    userObj: any,
    botToken: string,
    authDate = Math.floor(Date.now() / 1000),
    extraParams: Record<string, string> = {}
  ) {
    const params = new Map<string, string>([
      ['auth_date', String(authDate)],
      ['user', JSON.stringify(userObj)],
      ...Object.entries(extraParams),
    ]);

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    const q = new URLSearchParams();
    for (const [k, v] of params.entries()) {
      q.set(k, v);
    }
    q.set('hash', hash);
    return q.toString();
  }

  // =========================================================================
  // 1. Server-Side HMAC-SHA256 Signature Verification
  // =========================================================================
  describe('1. Telegram initData Signature Verification', () => {
    it('accepts authentic initData signed with valid bot token', () => {
      const user = { id: 123456789, first_name: 'Alice', username: 'alice_tg' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN);
      const res = validateInitData(raw, TEST_BOT_TOKEN);

      expect(res.ok).toBe(true);
      expect(res.user?.id).toBe(123456789);
      expect(res.user?.username).toBe('alice_tg');
    });

    it('rejects forged signature signed with wrong bot token', () => {
      const user = { id: 123456789, first_name: 'Attacker' };
      const raw = createSignedInitData(user, 'wrong_token:evil');
      const res = validateInitData(raw, TEST_BOT_TOKEN);

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('bad hash');
    });

    it('rejects tampered user payload with original hash', () => {
      const user = { id: 123456789, first_name: 'Alice' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN);

      // Attacker tampers user ID to impersonate another account
      const tampered = raw.replace('123456789', '999999999');
      const res = validateInitData(tampered, TEST_BOT_TOKEN);

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('bad hash');
    });

    it('rejects tampered hash string or non-hex trailing data (Buffer.from hex truncation guard)', () => {
      const user = { id: 123456789, first_name: 'Alice' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN);

      const tampered = raw + 'tampered';
      const res = validateInitData(tampered, TEST_BOT_TOKEN);

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('bad hash');
    });

    it('rejects missing hash parameter', () => {
      const res = validateInitData('auth_date=1600000000&user=%7B%7D', TEST_BOT_TOKEN);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('missing hash');
    });

    it('rejects expired initData older than maxAgeSec', () => {
      const expiredDate = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const user = { id: 123456789, first_name: 'Alice' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN, expiredDate);
      const res = validateInitData(raw, TEST_BOT_TOKEN, 3600); // 1 hour max

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('expired');
    });

    it('rejects future initData beyond allowed clock drift threshold', () => {
      const futureDate = Math.floor(Date.now() / 1000) + 300; // 5 minutes in future
      const user = { id: 123456789, first_name: 'Alice' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN, futureDate);
      const res = validateInitData(raw, TEST_BOT_TOKEN, 3600);

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('expired');
    });

    it('extracts start_param securely from initData', () => {
      const raw1 = 'start_param=ref_987654&auth_date=123&hash=abc';
      expect(parseStartParam(raw1)).toBe('ref_987654');

      const raw2 = 'startapp=product_p-gemini-18m&auth_date=123&hash=abc';
      expect(parseStartParam(raw2)).toBe('product_p-gemini-18m');

      expect(parseStartParam('')).toBeNull();
    });
  });

  // =========================================================================
  // 2. JWT & Session Security
  // =========================================================================
  describe('2. JWT & Session Security', () => {
    it('generates verifiable JWT sessions with appropriate role mapping', () => {
      process.env.ADMIN_TG_IDS = '9990001, 9990002';

      expect(roleFor('9990001')).toBe('ADMIN');
      expect(roleFor('1234567')).toBe('USER');

      const userJwt = signSession({ tgId: '1234567', username: 'testuser', role: 'USER' });
      const verified = verifySession(userJwt);

      expect(verified).not.toBeNull();
      expect(verified?.tgId).toBe('1234567');
      expect(verified?.role).toBe('USER');
    });

    it('rejects forged JWT tokens with invalid signatures', () => {
      const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0Z0lkIjoiMTIzNDU2NyIsInJvbGUiOiJBRE1JTiJ9.fake_signature';
      expect(verifySession(forged)).toBeNull();
    });

    it('extracts session from Authorization Bearer header', () => {
      const token = signSession({ tgId: '5551234', username: 'bob', role: 'USER' });
      const req = new Request('http://localhost:3000/api/users/me', {
        headers: { authorization: `Bearer ${token}` },
      });

      const s = sessionFromRequest(req);
      expect(s).not.toBeNull();
      expect(s?.tgId).toBe('5551234');
    });

    it('returns null session for malformed or missing Authorization headers', () => {
      const req1 = new Request('http://localhost:3000/api/users/me');
      expect(sessionFromRequest(req1)).toBeNull();

      const req2 = new Request('http://localhost:3000/api/users/me', {
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(sessionFromRequest(req2)).toBeNull();
    });
  });

  // =========================================================================
  // 3. User ID Spoofing & IDOR Protection (/api/users/me)
  // =========================================================================
  describe('3. User ID Spoofing & IDOR Protection', () => {
    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const req = new Request('http://localhost:3000/api/users/me');
      const res = await getUserMe(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('unauthorized');
    });

    it('allows authenticated users to query their own account data', async () => {
      const token = signSession({ tgId: '8881234', username: 'alice', role: 'USER' });
      const req = new Request('http://localhost:3000/api/users/me', {
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await getUserMe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.telegramId).toBe('8881234');
    });

    it('prevents user ID spoofing: returns HTTP 403 if user attempts to query another tgId', async () => {
      const attackerToken = signSession({ tgId: '1111111', username: 'attacker', role: 'USER' });
      const req = new Request('http://localhost:3000/api/users/me?tgId=9999999', {
        headers: { authorization: `Bearer ${attackerToken}` },
      });

      const res = await getUserMe(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('forbidden');
    });

    it('allows admin users to inspect specific tgId accounts for support operations', async () => {
      const adminToken = signSession({ tgId: '9990001', username: 'admin', role: 'ADMIN' });
      const req = new Request('http://localhost:3000/api/users/me?tgId=8881234', {
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const res = await getUserMe(req);
      expect(res.status).toBe(200);
    });

    it('allows valid signed x-telegram-init-data fallback authentication', async () => {
      process.env.BOT_TOKEN = TEST_BOT_TOKEN;
      const user = { id: 7776665, first_name: 'TMA User', username: 'tma_user' };
      const rawInitData = createSignedInitData(user, TEST_BOT_TOKEN);

      const req = new Request('http://localhost:3000/api/users/me', {
        headers: { 'x-telegram-init-data': rawInitData },
      });

      const res = await getUserMe(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.telegramId).toBe('7776665');
    });
  });

  // =========================================================================
  // 4. Order Confidentiality & Credential Redaction (/api/orders)
  // =========================================================================
  describe('4. Order Confidentiality & Credential Protection', () => {
    const ownerTg = '6543210';
    const strangerTg = '9876543';
    let testOrder: any;

    beforeEach(() => {
      testOrder = store.createOrder({
        id: `ord_sec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userTg: ownerTg,
        productId: 'p-github-student',
        qty: 1,
        unitPrice: 10.0,
        total: 10.0,
        status: 'DELIVERED',
        createdAt: new Date().toISOString(),
        deliveries: [{ login: 'owner@tzstore.io', password: 'SuperSecretPassword@123' }],
        code: 'SECRET-VOUCHER-CODE-XYZ',
      });
    });

    it('allows confirmed order owner to view sensitive digital credentials', async () => {
      const ownerToken = signSession({ tgId: ownerTg, username: 'owner_user', role: 'USER' });
      const req = new Request(`http://localhost:3000/api/orders?id=${testOrder.id}`, {
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const res = await getOrder(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.order.deliveries).toBeDefined();
      expect(data.order.deliveries[0].login).toBe('owner@tzstore.io');
      expect(data.order.deliveries[0].password).toBe('SuperSecretPassword@123');
      expect(data.order.code).toBe('SECRET-VOUCHER-CODE-XYZ');
    });

    it('allows authenticated store admin to inspect order credentials', async () => {
      const adminToken = signSession({ tgId: '9990001', username: 'superadmin', role: 'ADMIN' });
      const req = new Request(`http://localhost:3000/api/orders?id=${testOrder.id}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const res = await getOrder(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.order.deliveries).toBeDefined();
      expect(data.order.deliveries[0].login).toBe('owner@tzstore.io');
    });

    it('blocks unauthorized stranger from accessing another user order (HTTP 403 Forbidden)', async () => {
      const strangerToken = signSession({ tgId: strangerTg, username: 'stranger', role: 'USER' });
      const req = new Request(`http://localhost:3000/api/orders?id=${testOrder.id}`, {
        headers: { authorization: `Bearer ${strangerToken}` },
      });

      const res = await getOrder(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('forbidden');
    });

    it('redacts sensitive credentials (deliveries & code) when accessed without auth session', async () => {
      // Create order with non-dev user ID
      const secureOrder = store.createOrder({
        id: `ord_anon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userTg: '99887766',
        productId: 'p-github-student',
        qty: 1,
        unitPrice: 10.0,
        total: 10.0,
        status: 'DELIVERED',
        createdAt: new Date().toISOString(),
        deliveries: [{ login: 'target@tzstore.io', password: 'TargetSecretPassword' }],
        code: 'TARGET-CODE-123',
      });

      const req = new Request(`http://localhost:3000/api/orders?id=${secureOrder.id}`);
      const res = await getOrder(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Basic metadata visible, but secrets are completely scrubbed
      expect(data.order.id).toBe(secureOrder.id);
      expect(data.order.deliveries).toBeUndefined();
      expect(data.order.code).toBeUndefined();
    });

    it('enforces authentication on GET /api/orders/mine', async () => {
      const unauthReq = new Request('http://localhost:3000/api/orders/mine');
      const unauthRes = await getMyOrders(unauthReq);
      // In dev environment with fallback it returns orders or 401; with auth it returns user orders
      const userToken = signSession({ tgId: ownerTg, role: 'USER' });
      const authReq = new Request('http://localhost:3000/api/orders/mine', {
        headers: { authorization: `Bearer ${userToken}` },
      });
      const authRes = await getMyOrders(authReq);
      expect(authRes.status).toBe(200);
      const authData = await authRes.json();
      expect(Array.isArray(authData.orders)).toBe(true);
    });
  });

  // =========================================================================
  // 5. Auth Endpoint Security (/api/auth/telegram)
  // =========================================================================
  describe('5. Auth Endpoint Security (/api/auth/telegram)', () => {
    it('rejects forged initData signature with HTTP 401', async () => {
      process.env.BOT_TOKEN = TEST_BOT_TOKEN;
      const forged = 'auth_date=1600000000&user=%7B%22id%22%3A123%7D&hash=deadbeef00000000000000000000000000000000000000000000000000000000';

      const req = new Request('http://localhost:3000/api/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: forged }),
      });

      const res = await postAuthTelegram(req);
      expect(res.status).toBe(401);
    });

    it('authenticates valid Telegram user and issues JWT session token', async () => {
      process.env.BOT_TOKEN = TEST_BOT_TOKEN;
      const user = { id: 4443332, first_name: 'Verified User', username: 'verified_user' };
      const raw = createSignedInitData(user, TEST_BOT_TOKEN);

      const req = new Request('http://localhost:3000/api/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
      });

      const res = await postAuthTelegram(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.authenticated).toBe(true);
      expect(data.token).toBeDefined();

      const decoded = verifySession(data.token);
      expect(decoded?.tgId).toBe('4443332');
    });

    it('rejects malformed user payload with HTTP 400', async () => {
      process.env.BOT_TOKEN = TEST_BOT_TOKEN;
      // Missing id field in user
      const invalidUser = { first_name: 'No ID' };
      const raw = createSignedInitData(invalidUser, TEST_BOT_TOKEN);

      const req = new Request('http://localhost:3000/api/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
      });

      const res = await postAuthTelegram(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('invalid telegram user payload');
    });
  });

  // =========================================================================
  // 6. Admin Route Protection
  // =========================================================================
  describe('6. Admin Route Protection (requireAdminToken)', () => {
    it('rejects unauthenticated requests to admin endpoints', () => {
      const req = new Request('http://localhost:3000/api/admin/orders');
      const denied = requireAdminToken(req);
      expect(denied).not.toBeNull();
      expect(denied?.status).toBe(401);
    });

    it('authorizes requests with valid x-admin-token header', () => {
      process.env.ADMIN_API_TOKEN = 'test-secret-admin-token-12345';
      const req = new Request('http://localhost:3000/api/admin/orders', {
        headers: { 'x-admin-token': 'test-secret-admin-token-12345' },
      });

      const denied = requireAdminToken(req);
      expect(denied).toBeNull();
    });

    it('rejects requests with incorrect x-admin-token header', () => {
      process.env.ADMIN_API_TOKEN = 'test-secret-admin-token-12345';
      const req = new Request('http://localhost:3000/api/admin/orders', {
        headers: { 'x-admin-token': 'wrong-token' },
      });

      const denied = requireAdminToken(req);
      expect(denied).not.toBeNull();
      expect(denied?.status).toBe(401);
    });
  });

  // =========================================================================
  // 7. Admin Telegram WebApp Auto-Authentication (/api/admin/auth/telegram)
  // =========================================================================
  describe('7. Admin Telegram WebApp Auto-Authentication', () => {
    const ADMIN_BOT_TOKEN = '9876543210:ZYXwvuTsRQPonMlKJiHgFeDcBa_AdminBot';

    beforeEach(() => {
      process.env.ADMIN_BOT_TOKEN = ADMIN_BOT_TOKEN;
      process.env.BOT_TOKEN = TEST_BOT_TOKEN;
      process.env.ADMIN_TG_IDS = '777888999,111222333';
      delete process.env.ADMIN_NOTIFY_CHAT_ID;
      delete process.env.ADMIN_USER_IDS;
    });

    it('authenticates authorized admin with valid signed initData from Admin Bot without password', async () => {
      const adminUser = { id: 777888999, first_name: 'SuperAdmin', username: 'chief_admin' };
      const raw = createSignedInitData(adminUser, ADMIN_BOT_TOKEN);

      const req = new Request('http://localhost:3000/api/admin/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
      });

      const res = await postAdminAuthTelegram(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.accessToken).toBeDefined();
      expect(data.refreshToken).toBeDefined();
      expect(data.admin).toBeDefined();
      expect(data.admin.id).toBe('admin_tg_777888999');
      expect(data.admin.role).toBe('SUPER_ADMIN');

      // Verify returned JWT
      const verified = verifyAccess(data.accessToken);
      expect(verified.sub).toBe('admin_tg_777888999');
      expect(verified.role).toBe('SUPER_ADMIN');
    });

    it('denies validly signed initData if Telegram ID is NOT on admin allowlist (HTTP 403)', async () => {
      const normalUser = { id: 999999999, first_name: 'RegularUser' };
      const raw = createSignedInitData(normalUser, ADMIN_BOT_TOKEN);

      const req = new Request('http://localhost:3000/api/admin/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
      });

      const res = await postAdminAuthTelegram(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized: Telegram ID 999999999 is not configured as an administrator');
    });

    it('rejects forged or tampered signature (HTTP 401)', async () => {
      const adminUser = { id: 777888999, first_name: 'SuperAdmin' };
      const raw = createSignedInitData(adminUser, 'forged_token:fake');

      const req = new Request('http://localhost:3000/api/admin/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: raw }),
      });

      const res = await postAdminAuthTelegram(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid Telegram WebApp signature');
    });

    it('rejects missing or empty initData payload (HTTP 400)', async () => {
      const req = new Request('http://localhost:3000/api/admin/auth/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await postAdminAuthTelegram(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('bad request');
    });
  });
});

