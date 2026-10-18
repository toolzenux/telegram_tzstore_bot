import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  BOT_TOKEN: z.string().min(1),
  ADMIN_NOTIFY_CHAT_ID: z.string().default(''),
  BINANCE_PAY_MERCHANT_ID: z.string().default(''),
  BINANCE_PAY_API_KEY: z.string().default(''),
  BINANCE_PAY_SECRET: z.string().default(''),
  BINANCE_PAY_SANDBOX: z.coerce.boolean().default(true),
  // Personal account (no merchant needed): store UID shown to buyers + Spot API for auto-verify
  BINANCE_UID: z.string().default('1134278389'),
  BINANCE_SPOT_API_KEY: z.string().default(''),
  BINANCE_SPOT_SECRET: z.string().default(''),
  WEBAPP_URL: z.string().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  SUPPORT_URL: z.string().default('https://t.me/TzStore_Support'),
  CHANNEL_URL: z.string().default('https://t.me/TZStoreChannel'),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
