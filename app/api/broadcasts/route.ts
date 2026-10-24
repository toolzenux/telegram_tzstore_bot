export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAdminFromRequest, audit } from '@/lib/admin-jwt';

const createBroadcastSchema = z.object({
  title: z.string().optional().default('Announcement'),
  text: z.string().min(1, 'Message text is required'),
  targetType: z.enum(['ALL', 'SEGMENT']).default('ALL'),
});

export async function GET(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const prisma = db();
  if (!prisma) return NextResponse.json([]);

  try {
    const list = await prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error('Broadcast GET error:', e);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'MANAGER' && (admin.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  const rawTitle = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : 'Announcement';
  const rawText = typeof json.text === 'string' ? json.text.trim() : '';

  if (!rawText) {
    return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
  }

  const prisma = db();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  try {
    const b = await prisma.broadcast.create({
      data: {
        title: rawTitle,
        text: rawText,
        targetType: json.targetType === 'SEGMENT' ? 'SEGMENT' : 'ALL',
        status: 'DRAFT',
      },
    });

    const clientIp = req.headers.get('x-forwarded-for') || '';
    audit(admin.id, 'create', 'broadcast', b.id, null, b, clientIp).catch(() => null);

    return NextResponse.json(b, { status: 201 });
  } catch (e: any) {
    console.error('Broadcast create error:', e);
    return NextResponse.json({ error: e?.message || 'failed to create broadcast' }, { status: 500 });
  }
}
