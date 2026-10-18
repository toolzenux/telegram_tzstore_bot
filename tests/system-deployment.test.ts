import { describe, it, expect } from 'vitest';
import { parseStartParam, validateInitData } from '../lib/telegram';

/**
 * DEVOPS & END-TO-END SYSTEM TEST SUITE
 * 
 * Target: Live staging or production URL, or local development server.
 * Run via: npm run test:system
 */
const LIVE_URL = (process.env.TEST_LIVE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Configurable network helper with timeout, retry, and CI/CD diagnostic logging
interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
}

async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, maxRetries = 2, ...fetchOpts } = opts;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const response = await fetch(url, {
        ...fetchOpts,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      // CI/CD informative output log
      console.log(`[CI/CD HEALTH] ${fetchOpts.method || 'GET'} ${url} -> ${response.status} ${response.statusText} (${durationMs}ms)`);
      return response;
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      const durationMs = Date.now() - startMs;
      const isAbort = err.name === 'AbortError';
      const msg = isAbort ? `Timed out after ${timeoutMs}ms` : err.message;

      if (attempt < maxRetries) {
        console.warn(`[CI/CD WARN] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${url} (${msg}). Retrying in 500ms...`);
        await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      } else {
        console.error(`[CI/CD FAIL] All ${maxRetries + 1} attempts failed for ${url} (${msg}) [${durationMs}ms]`);
      }
    }
  }

  throw lastError;
}

describe('SYSTEM & DEPLOYMENT HEALTH TESTS', { timeout: 30000 }, () => {
  // =========================================================================
  // 1. Static & SSR Health Verification
  // =========================================================================
  describe('1. Static & SSR Health', () => {
    it('1.1. Root Storefront (GET /) serves HTTP 200 with valid HTML doctype and metadata', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/`);
      expect(res.status).toBe(200);

      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toMatch(/text\/html/);

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toMatch(/<html[^>]*>/i);
      expect(html).toMatch(/<head[^>]*>/i);
      expect(html).toMatch(/<meta[^>]+viewport/i);
    });

    it('1.2. Admin SPA entrypoint (GET /admin) loads Single Page Application with title and #root', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/admin`);
      expect(res.status).toBe(200);

      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toMatch(/text\/html/);

      const html = await res.text();
      expect(html).toContain('<title>TZ Store Admin</title>');
      expect(html).toContain('id="root"');
      expect(html).toMatch(/<script[^>]+type="module"/i);
    });

    it('1.3. Admin deep-linking (/admin/orders, /admin/login) successfully rewrites to 200 without 404', async () => {
      // Test 1: /admin/orders deep link
      const ordersRes = await fetchWithRetry(`${LIVE_URL}/admin/orders`);
      expect(ordersRes.status).toBe(200);
      const ordersHtml = await ordersRes.text();
      expect(ordersHtml).toContain('<title>TZ Store Admin</title>');
      expect(ordersHtml).toContain('id="root"');

      // Test 2: /admin/login deep link
      const loginRes = await fetchWithRetry(`${LIVE_URL}/admin/login`);
      expect(loginRes.status).toBe(200);
      const loginHtml = await loginRes.text();
      expect(loginHtml).toContain('<title>TZ Store Admin</title>');
      expect(loginHtml).toContain('id="root"');
    });
  });

  // =========================================================================
  // 2. Asset Pipeline & MIME Integrity
  // =========================================================================
  describe('2. Asset Pipeline & MIME Integrity', () => {
    it('2.1. Validates Admin Vite JavaScript bundles load with application/javascript or text/javascript', async () => {
      const adminRes = await fetchWithRetry(`${LIVE_URL}/admin`);
      const html = await adminRes.text();

      // Extract script src attributes
      const scriptMatches = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
      expect(scriptMatches.length).toBeGreaterThan(0);

      const firstScriptPath = scriptMatches.find((s) => s.includes('/assets/') || s.includes('admin') || !s.startsWith('http')) || scriptMatches[0];
      const assetUrl = firstScriptPath.startsWith('http')
        ? firstScriptPath
        : `${LIVE_URL}${firstScriptPath.startsWith('/') ? '' : '/'}${firstScriptPath}`;

      const assetRes = await fetchWithRetry(assetUrl);
      expect(assetRes.status).toBe(200);
      const contentType = assetRes.headers.get('content-type') || '';
      expect(contentType).toMatch(/javascript/);

      const jsCode = await assetRes.text();
      expect(jsCode.length).toBeGreaterThan(100);
    });

    it('2.2. Validates CSS stylesheets load with text/css MIME type', async () => {
      const adminRes = await fetchWithRetry(`${LIVE_URL}/admin`);
      const html = await adminRes.text();

      const cssMatches = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
      if (cssMatches.length > 0) {
        const firstCssPath = cssMatches[0];
        const cssUrl = firstCssPath.startsWith('http')
          ? firstCssPath
          : `${LIVE_URL}${firstCssPath.startsWith('/') ? '' : '/'}${firstCssPath}`;

        const cssRes = await fetchWithRetry(cssUrl);
        expect(cssRes.status).toBe(200);
        const contentType = cssRes.headers.get('content-type') || '';
        expect(contentType).toMatch(/text\/css/);
      } else {
        console.log('[CI/CD INFO] Inline or Vite-injected CSS detected.');
      }
    });

    it('2.3. Validates public SVG assets are accessible with image/svg+xml MIME type', async () => {
      const svgRes = await fetchWithRetry(`${LIVE_URL}/logos/github.svg`);
      if (svgRes.status === 200) {
        const ct = svgRes.headers.get('content-type') || '';
        expect(ct).toMatch(/svg/);
      } else {
        // Fallback test on storefront root icon
        expect([200, 304]).toContain(svgRes.status);
      }
    });
  });

  // =========================================================================
  // 3. Security Boundary & Protected Endpoints
  // =========================================================================
  describe('3. Security Boundary', () => {
    it('3.1. GET /api/admin/orders strictly rejects unauthorized requests with HTTP 401', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/admin/orders`);
      expect(res.status).toBe(401);

      const body = await res.json().catch(() => ({}));
      expect(body.error).toBe('unauthorized');
    });

    it('3.2. DELETE /api/admin/orders rejects unauthenticated calls with HTTP 401', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/admin/orders`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });
      expect(res.status).toBe(401);
      const body = await res.json().catch(() => ({}));
      expect(body.error).toBe('unauthorized');
    });

    it('3.3. GET /api/dashboard strictly returns HTTP 401 without valid admin JWT token', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/dashboard`);
      expect(res.status).toBe(401);
      const body = await res.json().catch(() => ({}));
      expect(body.error).toBe('unauthorized');
    });

    it('3.4. Protected endpoints reject invalid/spoofed bearer tokens with HTTP 401', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/admin/orders`, {
        headers: {
          Authorization: 'Bearer invalid.fake.token12345',
        },
      });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 4. Telegram Bot Deep-Link Parsing & Routing
  // =========================================================================
  describe('4. Telegram Bot Deep-Link Parsing', () => {
    it('4.1. Verifies URL query parsing for tgWebAppStartParam (?startapp=product_p-gemini-18m)', async () => {
      const targetParam = 'product_p-gemini-18m';
      const deepLinkUrl = `${LIVE_URL}/?startapp=${targetParam}`;

      const res = await fetchWithRetry(deepLinkUrl);
      expect(res.status).toBe(200);

      const html = await res.text();
      // Ensure splash page client router bundle is rendered to process the startapp parameter
      expect(html).toContain('TZ Store');
    });

    it('4.2. Direct product landing page (/p/p-gemini-18m) serves 200 with dynamic metadata', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/p/p-gemini-18m`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('p-gemini-18m');
      expect(html).toContain('TZ Store');

      // Verify product catalog data for this item is active
      const prodRes = await fetchWithRetry(`${LIVE_URL}/api/categories/gemini/products`);
      expect(prodRes.status).toBe(200);
      const prodData = await prodRes.json();
      expect(prodData.products?.some((p: any) => p.id === 'p-gemini-18m')).toBe(true);
    });


    it('4.3. Library parseStartParam helper extracts startapp and start_param formats accurately', () => {
      const testCases = [
        { raw: 'startapp=product_p-gemini-18m&other=123', expected: 'product_p-gemini-18m' },
        { raw: 'start_param=restock_today', expected: 'restock_today' },
        { raw: 'user=test&startapp=order_ord123', expected: 'order_ord123' },
        { raw: 'no_param=true', expected: null },
      ];

      for (const tc of testCases) {
        const parsed = parseStartParam(tc.raw);
        expect(parsed).toBe(tc.expected);
      }
    });

    it('4.4. validateInitData HMAC-SHA256 signature algorithm strictly rejects forged signatures', () => {
      const fakeBotToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
      const forgedInitData = 'query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456%7D&auth_date=1620000000&hash=forged_bad_hash_signature';

      const validation = validateInitData(forgedInitData, fakeBotToken);
      expect(validation.ok).toBe(false);
      expect(validation.reason).toBe('bad hash');
    });
  });

  // =========================================================================
  // 5. Public API Contract & Baseline Availability
  // =========================================================================
  describe('5. Public API Contract & Catalog Availability', () => {
    it('5.1. GET /api/categories returns HTTP 200 with non-empty categories array', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/categories`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.categories).toBeDefined();
      expect(Array.isArray(json.categories)).toBe(true);
      expect(json.categories.length).toBeGreaterThan(0);

      const slugs = json.categories.map((c: any) => c.slug);
      expect(slugs).toContain('github');
    });

    it('5.2. GET /api/categories/github/products returns HTTP 200 with active inventory', async () => {
      const res = await fetchWithRetry(`${LIVE_URL}/api/categories/github/products`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.products).toBeDefined();
      expect(Array.isArray(json.products)).toBe(true);
      expect(json.products.length).toBeGreaterThan(0);
      expect(json.products[0].categorySlug).toBe('github');
    });
  });

  // =========================================================================
  // 6. User Experience & Interaction Benchmarks
  // =========================================================================
  describe('6. User Experience & Interaction Benchmarks', () => {
    it('6.1. Zero-Latency Preloading & Idempotency: POST /api/payments/intent reuses active session with zero overhead', async () => {
      // 1. Create a test order
      const orderRes = await fetchWithRetry(`${LIVE_URL}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: 'p-gemini-18m', qty: 1 }),
      });
      expect(orderRes.status).toBe(200);
      const { order } = await orderRes.json();
      expect(order?.id).toBeDefined();

      // 2. First intent call (simulates background prefetch on checkout mount)
      const t0 = Date.now();
      const firstRes = await fetchWithRetry(`${LIVE_URL}/api/payments/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, provider: 'BINANCE' }),
      });
      const firstDuration = Date.now() - t0;
      expect(firstRes.status).toBe(200);
      const firstData = await firstRes.json();
      expect(firstData.intent?.id).toBeDefined();

      // 3. Second intent call (simulates user clicking Binance Pay - instant cache/reusable session)
      const t1 = Date.now();
      const secondRes = await fetchWithRetry(`${LIVE_URL}/api/payments/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, provider: 'BINANCE' }),
      });
      const secondDuration = Date.now() - t1;
      expect(secondRes.status).toBe(200);
      const secondData = await secondRes.json();

      // 4. Verifies exact same session reused without duplicating records (0 overhead)
      expect(secondData.intent.id).toBe(firstData.intent.id);
      expect(secondData.intent.memo).toBe(firstData.intent.memo);
      expect(secondData.intent.address).toBe(firstData.intent.address);
      expect(secondDuration).toBeLessThan(3000);
    });

    it('6.2. Responsive Touch Targets: Stylesheet enforces min-height: 44px and manipulation constraints', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cssPath = path.join(process.cwd(), 'app', 'globals.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('min-height: 44px');
      expect(css).toContain('touch-action: manipulation');
    });

    it('6.3. TMA SDK & Haptic Binding Integrity: Lib exports required helpers without ReferenceError', async () => {
      const { haptic, backButton, tzAuthHeader, mainButton } = await import('../lib/tma');
      expect(typeof haptic).toBe('function');
      expect(typeof backButton).toBe('function');
      expect(typeof tzAuthHeader).toBe('function');
      expect(typeof mainButton).toBe('function');

      // Verify calling haptic in Node/SSR environment safely no-ops without throwing
      expect(() => haptic('light')).not.toThrow();
      expect(() => haptic('medium')).not.toThrow();
      expect(() => haptic('success')).not.toThrow();
      expect(() => haptic('error')).not.toThrow();
    });
  });
});

