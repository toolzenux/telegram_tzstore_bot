export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest, audit } from '@/lib/admin-jwt';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'MANAGER' && (admin.role as string) !== 'ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const prisma = db();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  try {
    const existing = await prisma.broadcast.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

    await prisma.broadcast.delete({ where: { id: params.id } });

    const clientIp = req.headers.get('x-forwarded-for') || '';
    audit(admin.id, 'delete', 'broadcast', params.id, existing, null, clientIp).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete broadcast error:', e);
    return NextResponse.json({ error: 'failed to delete broadcast' }, { status: 500 });
  }
}
