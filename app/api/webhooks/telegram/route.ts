import { NextResponse } from 'next/server';
import { setAdminChatId } from '@/lib/telegram-bot';
import { fulfillOrder } from '@/lib/fulfill';
import { store } from '@/lib/store';

const BOT_TOKEN = () => process.env.BOT_TOKEN || '';

export async function POST(req: Request) {
  try {
    const update = await req.json().catch(() => null);
    if (!update) return NextResponse.json({ ok: true });

    const token = BOT_TOKEN();
    if (!token) return NextResponse.json({ ok: true });

    // Authorized admin IDs check
    const adminIds = new Set(
      [
        process.env.ADMIN_NOTIFY_CHAT_ID,
        ...(process.env.ADMIN_USER_IDS ?? '').split(','),
        ...(process.env.ADMIN_TG_IDS ?? '').split(','),
      ]
        .map((s) => s?.trim())
        .filter(Boolean)
    );

    // 1. Handle incoming text commands (/start, /admin, /id)
    if (update.message?.text) {
      const text = update.message.text.trim();
      const chatId = String(update.message.chat.id);
      const fromId = String(update.message.from?.id ?? chatId);
      const username = update.message.from?.username ? `@${update.message.from.username}` : '';

      if (text.startsWith('/start') || text.startsWith('/admin')) {
        const isAuthorized = adminIds.size > 0 && (adminIds.has(chatId) || adminIds.has(fromId));
        if (!isAuthorized) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '⛔ <b>Access Denied:</b> This chat is not authorized for TZ Store Admin operations.',
              parse_mode: 'HTML',
            }),
          });
          return NextResponse.json({ ok: true });
        }

        await setAdminChatId(chatId);

        const reply =
          `👋 <b>Welcome to TZ Store Admin!</b>\n\n` +
          `✅ Your Telegram Chat ID (<code>${chatId}</code>) is now registered to receive:\n` +
          `• 🔔 <b>Payment Review Alerts</b> with 1-Tap Approve/Reject\n` +
          `• ⚠️ <b>Low-Stock Alerts</b> (<3 pcs left in vault)\n` +
          `• 📦 <b>Delivery Notifications</b>\n\n` +
          `🛍️ <i>Open the Mini App anytime to manage products.</i>`;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: reply,
            parse_mode: 'HTML',
          }),
        });
      } else if (text === '/id') {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👤 Your Telegram Chat ID is: <code>${chatId}</code> ${username}`,
            parse_mode: 'HTML',
          }),
        });
      }
    }

    // 2. Handle Inline Button Clicks (1-Tap Approve & Deliver / Reject)
    if (update.callback_query) {
      const cq = update.callback_query;
      const callerId = String(cq.from?.id ?? '');
      const isAllowedAdmin = adminIds.size > 0 && adminIds.has(callerId);
      if (!isAllowedAdmin) {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cq.id,
            text: '⛔ Unauthorized. You do not have admin permissions.',
            show_alert: true,
          }),
        });
        return NextResponse.json({ ok: true });
      }

      const data = String(cq.data ?? '');
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;

      if (data.startsWith('approve:')) {
        const orderId = data.replace('approve:', '');
        
        // Instant answer feedback to Telegram UI
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cq.id,
            text: '🚀 Approving order and auto-delivering credentials…',
            show_alert: false,
          }),
        });

        // Fulfill the order and deliver digital credentials
        let resultMsg = '✅ Approved & Delivered to customer!';
        try {
          const res = await fulfillOrder(orderId);
          if (res.status === 'NEEDS_REVIEW') {
            resultMsg = '⚠️ Approved payment, but vault is out of stock! Please restock.';
          }
        } catch (e: any) {
          resultMsg = `⚠️ Error: ${e.message}`;
        }

        // Edit the Telegram message to show confirmed state and remove action buttons
        if (chatId && messageId) {
          const originalText = cq.message?.text || '';
          const updatedText =
            `${originalText}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ <b>APPROVED & DELIVERED</b> by Admin at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}\n` +
            `📬 Digital credentials automatically dispatched to customer DM.`;

          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: updatedText,
              parse_mode: 'HTML',
            }),
          });
        }
      } else if (data.startsWith('reject:')) {
        const orderId = data.replace('reject:', '');

        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cq.id,
            text: '❌ Order marked as rejected.',
            show_alert: false,
          }),
        });

        store.setOrderStatus(orderId, 'CANCELLED');
        const it = store.allIntents().find((i) => i.orderId === orderId);
        if (it) store.setIntent(it.id, { status: 'CANCELLED' });

        if (chatId && messageId) {
          const originalText = cq.message?.text || '';
          const updatedText =
            `${originalText}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `❌ <b>REJECTED</b> by Admin at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: updatedText,
              parse_mode: 'HTML',
            }),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}
