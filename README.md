# TZ STORE — Telegram Bot + Admin Panel + Mini App

Production-ready monorepo for selling digital goods (subscriptions & accounts) via Telegram bot, Binance Pay (USDT), wallet system, referral program, and full SaaS admin panel.

**What exists:**
- `bot/` — legacy polling bot (classic UX, kept for reference)
- `app/` — Next.js Mini App storefront (catalog/checkout/orders)
- `backend/` — **NEW: production Admin API** (Express+TS+Prisma+Postgres+Redis/BullMQ+grammY webhook + Binance Pay + JWT RBAC) — this is what the Admin Panel talks to
- `admin/` — **NEW: production Admin Panel** (React 18 + Vite + TS + Tailwind + TanStack Table/Query + Recharts + zustand)

## Repository tree

```
backend/
  Dockerfile
  package.json
  prisma/schema.prisma      # Admin, User, Category, Product, StockItem, Order, WalletTransaction, BinancePayment, Broadcast, Setting, AuditLog
  prisma/seed.ts            # 16 categories + toolzenux@gmail.com / Toolzenux#@
  src/
    index.ts                # helmet, cors, rate-limit, pino, swagger /docs, broadcast worker
    env.ts                  # zod env validation
    db.ts redis.ts queues.ts logger.ts broadcast.worker.ts
    auth.ts                 # JWT access+refresh, bcrypt, RBAC, TOTP, audit()
    binance.ts              # HMAC-SHA512 sign + webhook verify (merchant mode)
    binance-spot.ts         # personal account: Spot HMAC-SHA256 + deposit matcher (no merchant)
    bot.ts                  # grammY webhook mode, reads products from DB, sendUserMessage/notifyAdmins
    openapi.yaml
    routes/
      auth.routes.ts        # login(+TOTP)/refresh/me/2fa setup+disable/change-password + admins CRUD
      catalog.routes.ts     # categories + products + stock import
      orders.routes.ts      # list/detail + markPaid/refund/resend/cancel + fulfillOrder + referral commission
      payments.routes.ts    # binance list + manual TXID queue approve/reject + POST /verify/:orderId (personal auto-verify)
      users.routes.ts       # search/profile/adjust/ban/reset-ref
      referrals.routes.ts   # % setting, leaderboard, ledger
      dashboard.routes.ts   # KPIs, revenue 7/30/90, top-5, donut, recent, bot health
      broadcast.routes.ts   # draft + queued via BullMQ, inline fallback when Redis down
      settings.routes.ts    # Bot/Payments/Referral/Wallet/Security tabs
      audit.routes.ts
      webhooks.routes.ts    # /webhooks/telegram, /webhooks/binance-pay (idempotent), /create
    tests/ via backend/tests/  # binance HMAC + wallet Decimal (vitest, 5 tests)
  .env.example
admin/
  Dockerfile + nginx.conf (SPA fallback)
  vite.config.ts tsconfig.json tailwind.config.js postcss.config.js index.html
  src/
    main.tsx App.tsx        # router + auth guard + RBAC 403 + 404
    api.ts                  # fetch client with JWT access+refresh rotation
    store.ts                # zustand auth/theme/sidebar
    ui.tsx                  # shadcn-style primitives: Button/Card/Input/Drawer/Badge/Skeleton/Toast
    layout.tsx              # collapsible sidebar, topbar, theme toggle, avatar menu
    pages/
      Login.tsx             # email+password+2FA, dev defaults filled
      Dashboard.tsx         # KPI cards, revenue line 30d, top-5 bar, donut, recent orders, bot health
      Products.tsx          # TanStack Table + search/filter/pagination/CSV + drawer + stock import + toggle
      Categories.tsx        # reorder up/down, emoji, toggle, delete confirm
      Orders.tsx            # status/method/date/search filters + detail drawer + raw webhook + 4 actions
      Payments.tsx          # Binance table w/ verification badge + manual TXID approve/reject queue
      Users.tsx             # search + profile drawer: wallet card, spent, ledger, referral tree, adjust/ban/reset
      Referrals.tsx         # commission % setting, leaderboard, commission ledger
      Broadcast.tsx         # compose + Telegram bubble preview + segment send + progress
      Settings.tsx          # tabs Bot/Payments/Referral/Wallet/Security (password + TOTP enroll)
      AdminsAudit.tsx       # admin accounts + roles (SUPER_ADMIN) + filterable audit log
docker-compose.yml  # postgres, redis, api, admin, nginx
nginx.conf
.env.example
```

## Prisma schema (backend)

See `backend/prisma/schema.prisma`. Key points:
- Money as `Decimal(10,2)` (never float). Wallet ledger: `WalletTransaction{type, amount signed, balanceAfter, note, orderId?, adminId?}`.
- `User.telegramId BigInt unique`, `referralCode unique`, `referredByUserId`, `referralEarnings`, `status ACTIVE|BANNED`.
- `Order.orderNo unique`, `paymentMethod BINANCE_PAY|WALLET|MANUAL_CRYPTO`, `paymentStatus PENDING|PAID|FAILED|REFUNDED`, `deliveryStatus`, `binancePayOrderNo?`, `txid?`.
- `BinancePayment.merchantOrderNo unique` for idempotent webhooks.
- `Setting(key unique, value Json)` stores botToken, binance keys, referralPercent, support/channel URLs, manual addresses.
- `AuditLog` on every mutating admin action.

Seed: `backend/prisma/seed.ts` creates the 16 categories (GitHub, CapCut, Grok, Canva, ChatGPT, Gemini, Claude, Email, TZ VIP, YouTube, Muse AI, Telegram Premium, Figma, VPN, Duolingo, Leonardo AI) + super admin `toolzenux@gmail.com / Toolzenux#@` + default settings.

## .env.example

See `.env.example` at repo root. Copy to `.env` + `backend/.env` + `admin/.env` as needed. Required: `DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, BOT_TOKEN, ADMIN_NOTIFY_CHAT_ID, BINANCE_PAY_*`.

## Run locally (numbered)

1. `cp .env.example .env` — fill `BOT_TOKEN` (BotFather), `JWT_*_SECRET` (32+ chars), `DATABASE_URL=postgresql://tz:tzsecret@localhost:5432/tzstore`.
2. Start infra: `docker compose up -d postgres redis` (or use local Postgres/Redis, set `REDIS_URL`).
3. Backend: `cd backend && npm install && npx prisma db push --schema=prisma/schema.prisma && npm run db:seed && npm run dev` → API on `:4000`, docs on `/docs`, health on `/health`.
4. Admin: `cd ../admin && npm install && echo "VITE_API_URL=http://localhost:4000" > .env && npm run dev` → panel on `http://localhost:5173`, login with `toolzenux@gmail.com / Toolzenux#@`.
5. Telegram webhook (dev): `cloudflared tunnel --url http://localhost:4000` → set `API_PUBLIC_URL` to tunnel URL, then `POST https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<API_PUBLIC_URL>/webhooks/telegram`.
6. Binance payments — TWO modes (Settings → Payments tab):
   - **Personal account (recommended, no merchant needed):** put your personal Binance **UID** (e.g. `1134278389`) in `BINANCE_UID`. Buyers send USDT to that UID and submit the Binance Order ID / TxID. In `/payments` click **🤖 Auto-verify**: the backend checks your Spot deposit history (`GET /sapi/v1/capital/deposit/hisrec`, HMAC-SHA256) for the order amount (+TXID) and on match marks PAID → auto-delivery + referral commission + Telegram notify. Needs a Spot API key/secret (api.binance.com → API Management → enable **Spot**, restrict IP). UID-to-UID internal transfers are invisible to any API → one-tap manual Approve stays as fallback.
   - **Merchant (optional):** with a Binance merchant account set webhook URL to `<API_PUBLIC_URL>/webhooks/binance-pay` + `BINANCE_PAY_MERCHANT_ID/API_KEY/SECRET` for fully automatic confirmation.
7. Manual deposit: user sends TXID → order `MANUAL_CRYPTO/PENDING` → `/payments` queue → Approve credits wallet + `WalletTransaction` + `AuditLog` + Telegram notify.
8. Tests: `cd backend && npm test` (Binance Pay HMAC + Spot signature/matcher + wallet Decimal logic, 11 tests passing).
9. Docker deploy: `docker compose up --build -d` → `api:4000, admin:8080, nginx:80`. Set BotFather menu button + domain to prod HTTPS URL. Set Telegram + Binance webhooks to prod domain.

## Security notes

- Binance webhook verified via HMAC-SHA512(`basePath+bizOrderId+bizStatus+timestamp`, SecretKey), constant-time compare, idempotent via unique `merchantOrderNo`. Never marks PAID without verification in prod.
- All `/api/*` behind JWT access + `requireRole(SUPER_ADMIN/MANAGER/SUPPORT)`; every mutation writes `AuditLog` with IP + before/after.
- zod on all DTOs, Prisma parameterized queries, helmet, rate-limit on `/api/auth/login` + `/webhooks/*`, CORS whitelist from env, secrets only from env (masked on read).
# telegram_store-_bot
