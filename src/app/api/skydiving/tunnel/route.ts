/**
 * BudgetGuard Tunnel Sessions API
 * GET /api/skydiving/tunnel - List all tunnel sessions
 * POST /api/skydiving/tunnel - Create a new tunnel session
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { CreateTunnelSessionSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { createTunnelSession, getAllTunnelSessions } from '@/services/database/SkydiveRepository';
import { eurosToCents } from '@/utils/money';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const year = searchParams.get('year');
    const location = searchParams.get('location');

    const filters = {
      ...(year ? { year: Number(year) } : {}),
      ...(location ? { location } : {}),
    };

    const sessions = await getAllTunnelSessions(filters);

    return NextResponse.json({
      success: true,
      data: sessions,
      meta: { count: sessions.length },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/skydiving/tunnel error:', error);
    return NextResponse.json({ success: false, error: 'Error loading tunnel sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateTunnelSessionSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { price, durationMin, ...rest } = validation.data;
    const session = await createTunnelSession({
      ...rest,
      durationSec: Math.round(durationMin * 60),
      priceCents: price != null ? eurosToCents(price) : null,
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/skydiving/tunnel error:', error);
    return NextResponse.json({ success: false, error: 'Error creating tunnel session' }, { status: 500 });
  }
}
