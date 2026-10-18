import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const CATS: Array<[string, string, number]> = [
  ['GitHub', '🐙', 1], ['CapCut', '🎬', 2], ['Grok', '🤖', 3], ['Canva', '🎨', 4],
  ['ChatGPT', '💬', 5], ['Gemini', '✨', 6], ['Claude', '🧠', 7],   ['Email', '📧', 8], ['TZ VIP', '👑', 9], ['YouTube', '▶️', 10], ['Muse AI', '♾️', 11], ['Telegram Premium', '✈️', 12],
  ['Figma', '🖌️', 13], ['VPN', '🛡️', 14], ['Duolingo', '🦉', 15], ['Leonardo AI', '🎭', 16],
];

async function main() {
  for (const [name, emoji, sortOrder] of CATS) {
    await prisma.category.upsert({ where: { name }, update: { emoji, sortOrder }, create: { name, emoji, sortOrder } });
  }
  const hash = await bcrypt.hash('Admin@123', 12);
  await prisma.admin.upsert({
    where: { email: 'admin@tzstore.io' },
    update: { role: 'SUPER_ADMIN' },
    create: { email: 'admin@tzstore.io', passwordHash: hash, role: 'SUPER_ADMIN' },
  });
  const defaults: Record<string, unknown> = {
    referralPercent: 5, supportUrl: 'https://t.me/TzStore_Support', channelUrl: 'https://t.me/TZStoreChannel',
    minDeposit: 1, manualAddresses: { TRC20: '', BEP20: '' }, botToken: '', binanceUid: '1134278389',
    binanceSpotApiKey: '', binanceSpotSecret: '', binanceMerchantId: '', binanceApiKey: '', binanceSecret: '',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  }
  console.log('seed ok: 16 categories + admin@tzstore.io / Admin@123');
}
main().finally(() => prisma.$disconnect());
