export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, audit } from '@/lib/admin-jwt';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function targets(prisma: any, segment: string): Promise<string[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  if (segment === 'active7d') {
    const rows = await prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, status: 'ACTIVE' },
      select: { telegramId: true },
    });
    return rows.map((r: any) => String(r.telegramId));
  }
  if (segment === 'buyers') {
    const rows = await prisma.order.findMany({
      where: { paymentStatus: 'PAID' },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r: any) => String(r.userId));
  }
  if (segment === 'neverBought') {
    const buyers = await prisma.order.findMany({
      where: { paymentStatus: 'PAID' },
      select: { userId: true },
      distinct: ['userId'],
    });
    const buyerSet = new Set(buyers.map((b: any) => String(b.userId)));
    const rows = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { telegramId: true },
    });
    return rows.map((r: any) => String(r.telegramId)).filter((id: string) => !buyerSet.has(id));
  }
  // Default: ALL active users
  const rows = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { telegramId: true },
  });
  return rows.map((r: any) => String(r.telegramId));
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'MANAGER' && (admin.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const broadcastId = params.id;
  const prisma = db();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  const b = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!b) return NextResponse.json({ error: 'broadcast not found' }, { status: 404 });

  const json = await req.json().catch(() => ({}));
  const segment = json.segment || 'all';

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: 'BOT_TOKEN is not configured on server' }, { status: 500 });
  }

  // Update status to SENDING
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: 'SENDING', sentCount: 0 },
  });

  const ids = await targets(prisma, segment).catch(() => []);

  // Format HTML message
  const hasHtml = /<[a-z][\s\S]*>/i.test(b.text);
  const formattedText = b.title?.trim()
    ? `📢 <b>${escapeHtml(b.title)}</b>\n\n${b.text}`
    : b.text;

  let sent = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: id,
          text: formattedText,
          parse_mode: 'HTML',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        sent += 1;
      } else {
        // Fallback plain text send if HTML parse fails
        const fallbackRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: id,
            text: `${b.title}\n\n${b.text}`,
          }),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (fallbackData.ok) sent += 1;
      }
    } catch (sendErr) {
      console.warn(`[Broadcast] Failed to send to TG ID ${id}:`, sendErr);
    }

    if (sent % 5 === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { sentCount: sent },
      }).catch(() => null);
    }

    // Safety pause to respect Telegram limits (~20 msg/sec)
    await new Promise((r) => setTimeout(r, 50));
  }

  // Mark broadcast as DONE
  const updated = await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: 'DONE', sentCount: sent },
  });

  const clientIp = req.headers.get('x-forwarded-for') || '';
  audit(admin.id, 'broadcast:send', 'broadcast', broadcastId, b.status, 'DONE', clientIp).catch(() => null);

  return NextResponse.json({ ok: true, sentCount: sent, total: ids.length, broadcast: updated });
}
