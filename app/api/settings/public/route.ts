export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { store } from '@/lib/store';

export async function GET() {
  let storeName = store.getSetting<string>('storeName') || process.env.NEXT_PUBLIC_STORE_NAME || 'TZ Store';
  let supportUrl = store.getSetting<string>('supportUrl') || process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://t.me/TzStore_Support';
  let channelUrl = store.getSetting<string>('channelUrl') || process.env.NEXT_PUBLIC_CHANNEL_URL || 'https://t.me/TZStoreChannel';

  const prisma = db();
  if (prisma) {
    try {
      const rows = await prisma.setting.findMany({
        where: { key: { in: ['storeName', 'supportUrl', 'channelUrl'] } },
      });
      for (const row of rows) {
        if (row.key === 'storeName' && typeof row.value === 'string' && row.value.trim()) {
          storeName = row.value.trim();
        }
        if (row.key === 'supportUrl' && typeof row.value === 'string' && row.value.trim()) {
          supportUrl = row.value.trim();
        }
        if (row.key === 'channelUrl' && typeof row.value === 'string' && row.value.trim()) {
          channelUrl = row.value.trim();
        }
      }
    } catch (e) {
      console.warn('Failed to fetch public settings from DB, using fallback:', e);
    }
  }

  return NextResponse.json({
    storeName,
    supportUrl,
    channelUrl,
  });
}
