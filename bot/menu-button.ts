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
function resolveStoreUrl(): string {
  const envUrl = (process.env.WEBAPP_URL || '').trim();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').trim();
  if (renderUrl && (!envUrl || envUrl.includes('trycloudflare.com') || envUrl.includes('localhost'))) {
    return renderUrl.replace(/\/+$/, '');
  }
  if (envUrl && !envUrl.includes('trycloudflare.com')) {
    return envUrl.replace(/\/+$/, '');
  }
  if (renderUrl) {
    return renderUrl.replace(/\/+$/, '');
  }
  return 'https://telegram-tzstore-bot.onrender.com';
}

async function initMenuButton() {
  const storeUrl = resolveStoreUrl();
  const adminUrl = `${storeUrl}/admin/mobile`;

  const adminIds = [
    ...(process.env.ADMIN_USER_IDS || '').split(','),
    ...(process.env.ADMIN_TG_IDS || '').split(','),
    process.env.ADMIN_NOTIFY_CHAT_ID,
  ]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];

  const uniqueAdminIds = Array.from(new Set(adminIds));

  if (process.env.BOT_TOKEN) {
    if (storeUrl.startsWith('https://')) {
      try {
        await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: '🛍️ Open Store', web_app: { url: storeUrl } } });
        console.log(`[Store Bot] Global Menu button set to: ${storeUrl}`);
      } catch (e: any) {
        console.warn('[Store Bot] Failed to set global menu button:', e?.message || e);
      }

      for (const id of uniqueAdminIds) {
        try {
          await bot.api.setChatMenuButton({
            chat_id: Number(id),
            menu_button: { type: 'web_app', text: '🛍️ Open Store', web_app: { url: storeUrl } },
          });
          console.log(`[Store Bot] Chat ${id} menu button set to: ${storeUrl}`);
        } catch {}
      }
    } else {
      console.log(`Note: URL ${storeUrl} is HTTP. Telegram Web App menu buttons require an HTTPS URL.`);
    }
  }

  if (process.env.ADMIN_BOT_TOKEN) {
    if (adminUrl.startsWith('https://')) {
      try {
        const adminBotInstance = new Bot(process.env.ADMIN_BOT_TOKEN, {
          client: { baseFetchConfig: { agent: ipv4Agent, compress: true } },
        });
        await adminBotInstance.api.setChatMenuButton({
          menu_button: { type: 'web_app', text: '🛠️ Admin Portal', web_app: { url: adminUrl } },
        });
        console.log(`[Admin Bot] Global Menu button set to: ${adminUrl}`);

        for (const id of uniqueAdminIds) {
          try {
            await adminBotInstance.api.setChatMenuButton({
              chat_id: Number(id),
              menu_button: { type: 'web_app', text: '🛠️ Admin Portal', web_app: { url: adminUrl } },
            });
            console.log(`[Admin Bot] Chat ${id} menu button set to: ${adminUrl}`);
          } catch {}
        }
      } catch (e: any) {
        console.warn('[Admin Bot] Failed to set menu button:', e?.message || e);
      }
    }
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
