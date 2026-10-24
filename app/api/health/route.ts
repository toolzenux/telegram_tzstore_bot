import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbStatus = 'disconnected';
  try {
    const prisma = db();
    if (prisma) {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } else {
      dbStatus = 'store-fallback';
    }
  } catch (err: any) {
    dbStatus = `error: ${err?.message || 'unknown'}`;
  }

  return NextResponse.json({
    status: 'ok',
    service: 'tz-store',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
