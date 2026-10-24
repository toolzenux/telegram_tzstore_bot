import { z } from 'zod';
const schema = z.object({
  BOT_TOKEN: z.string().min(10).optional(),
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please-1234'),
  JWT_TTL_SECONDS: z.coerce.number().default(86400),
  ENABLE_STARS: z.string().default('true'),
  ENABLE_TRC20: z.string().default('true'),
  ENABLE_BEP20: z.string().default('true'),
  ENABLE_BTC: z.string().default('true'),
  ENABLE_BINANCE: z.string().default('true'),
});
export const env = schema.parse({
  BOT_TOKEN: process.env.BOT_TOKEN,
  JWT_SECRET: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET,
  JWT_TTL_SECONDS: process.env.JWT_TTL_SECONDS,
  ENABLE_STARS: process.env.ENABLE_STARS,
  ENABLE_TRC20: process.env.ENABLE_TRC20,
  ENABLE_BEP20: process.env.ENABLE_BEP20,
  ENABLE_BTC: process.env.ENABLE_BTC,
  ENABLE_BINANCE: process.env.ENABLE_BINANCE,
});
export const flags = {
  stars: env.ENABLE_STARS === 'true',
  trc20: env.ENABLE_TRC20 === 'true',
  bep20: env.ENABLE_BEP20 === 'true',
  btc: env.ENABLE_BTC === 'true',
  binance: env.ENABLE_BINANCE === 'true',
};
