export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getAdminFromRequest, audit } from '@/lib/admin-jwt';
import { store } from '@/lib/store';

const SECRET_KEYS = new Set(['botToken', 'binanceSecret', 'binanceApiKey', 'binanceSpotApiKey', 'binanceSpotSecret']);

const settingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const prisma = db();
  const fileSettings = store.getSettings();
  const masked: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fileSettings)) {
    if (SECRET_KEYS.has(k)) masked[k] = '••••••';
    else masked[k] = v;
  }

  if (!prisma) return NextResponse.json(masked);

  try {
    const all = await prisma.setting.findMany();
    for (const s of all) {
      if (SECRET_KEYS.has(s.key)) masked[s.key] = '••••••';
      else masked[s.key] = s.value;
    }
    return NextResponse.json(masked);
  } catch (e) {
    console.error('Settings GET error:', e);
    return NextResponse.json(masked);
  }
}

export async function PUT(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'MANAGER' && (admin.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  
  // Extract list of key/value pairs (supports single key/value, settings object, or items array)
  let entries: Array<{ key: string; value: unknown }> = [];
  if (json && typeof json === 'object') {
    if (typeof (json as any).key === 'string' && (json as any).key.trim()) {
      entries.push({ key: (json as any).key.trim(), value: (json as any).value });
    } else if ((json as any).settings && typeof (json as any).settings === 'object' && !Array.isArray((json as any).settings)) {
      for (const [k, v] of Object.entries((json as any).settings)) {
        if (typeof k === 'string' && k.trim()) {
          entries.push({ key: k.trim(), value: v });
        }
      }
    } else if (Array.isArray((json as any).items)) {
      for (const item of (json as any).items) {
        if (item && typeof item.key === 'string' && item.key.trim()) {
          entries.push({ key: item.key.trim(), value: item.value });
        }
      }
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Invalid settings payload: provide key/value or settings object' }, { status: 400 });
  }

  const prisma = db();
  const clientIp = req.headers.get('x-forwarded-for') || '';

  // Process all entries concurrently for instant response
  await Promise.all(
    entries.map(async ({ key, value }) => {
      if (SECRET_KEYS.has(key) && value === '••••••') {
        return;
      }

      // Always update in-memory store for instant zero-latency reading
      store.setSetting(key, value);

      if (prisma) {
        try {
          const jsonVal = value === null
            ? Prisma.JsonNull
            : (value as Prisma.InputJsonValue);

          const before = await prisma.setting.findUnique({ where: { key } }).catch(() => null);

          await prisma.setting.upsert({
            where: { key },
            update: { value: jsonVal },
            create: { key, value: jsonVal },
          });

          const isSecret = SECRET_KEYS.has(key);
          const auditBefore = isSecret ? '••••••' : before?.value;
          const auditAfter = isSecret ? '••••••' : value;
          audit(admin.id, 'setting:update', 'setting', key, auditBefore, auditAfter, clientIp).catch(() => null);
        } catch (dbErr) {
          console.warn(`[Settings] DB upsert failed for key "${key}", file store updated:`, dbErr);
        }
      }
    })
  );

  return NextResponse.json({ ok: true, count: entries.length });
}
