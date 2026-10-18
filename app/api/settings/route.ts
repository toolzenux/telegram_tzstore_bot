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
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'MANAGER') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = settingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const prisma = db();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  if (SECRET_KEYS.has(parsed.data.key) && parsed.data.value === '••••••') {
    return NextResponse.json({ ok: true });
  }

  try {
    const before = await prisma.setting.findUnique({ where: { key: parsed.data.key } });
    const jsonVal = parsed.data.value === null
      ? Prisma.JsonNull
      : (parsed.data.value as Prisma.InputJsonValue);

    await prisma.setting.upsert({
      where: { key: parsed.data.key },
      update: { value: jsonVal },
      create: { key: parsed.data.key, value: jsonVal },
    });

    const isSecret = SECRET_KEYS.has(parsed.data.key);
    const auditBefore = isSecret ? '••••••' : before?.value;
    const auditAfter = isSecret ? '••••••' : parsed.data.value;
    const clientIp = req.headers.get('x-forwarded-for') || '';
    await audit(admin.id, 'setting:update', 'setting', parsed.data.key, auditBefore, auditAfter, clientIp);

    store.setSetting(parsed.data.key, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Settings PUT error:', e);
    store.setSetting(parsed.data.key, parsed.data.value);
    return NextResponse.json({ ok: true });
  }
}
