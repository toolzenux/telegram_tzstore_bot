import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { Bot, InlineKeyboard } from 'grammy';

if (!process.env.BOT_TOKEN) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || '').trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {}
}

const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });
const bot = new Bot(process.env.BOT_TOKEN || 'test-token', {
  client: {
    baseFetchConfig: {
      agent: ipv4Agent,
      compress: true,
    },
  },
});
const URL = process.env.WEBAPP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

async function initMenuButton() {
  if (!process.env.BOT_TOKEN) {
    console.error('BOT_TOKEN is not defined');
    return;
  }
  if (URL.startsWith('https://')) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Open Store', web_app: { url: URL } } });
    console.log(`Menu button set to: ${URL}`);
  } else {
    console.log(`Note: URL ${URL} is HTTP. Telegram Web App menu buttons require an HTTPS URL.`);
  }
}

if (require.main === module || !module.parent) {
  initMenuButton().catch(console.error);
}
export async function restockBroadcast(chatId: string | number, productId: string, title: string, qty: number, price: string) {
  const buyBtn = URL.startsWith('https://')
    ? { text: 'Buy Now', web_app: { url: `${URL}/p/${productId}?startapp=restock_${productId}` } }
    : { text: 'Buy Now', url: `${URL}/p/${productId}?startapp=restock_${productId}` };
  await bot.api.sendMessage(chatId, `🎁 Restocked!\n${title}\n✅ Available: ${qty}\n💎 Price: ${price}`, {
    reply_markup: new InlineKeyboard().row(buyBtn),
  });
}
// Deep links: ${URL}?startapp=product_<id> | restock_<id> | order_<id>
