/**
 * BudgetGuard Tunnel Session Detail API
 * PUT /api/skydiving/tunnel/[id] - Update tunnel session
 * DELETE /api/skydiving/tunnel/[id] - Delete tunnel session
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { UpdateTunnelSessionSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { deleteTunnelSession, updateTunnelSession } from '@/services/database/SkydiveRepository';
import { eurosToCents } from '@/utils/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessionId = Number(id);
    if (Number.isNaN(sessionId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateTunnelSessionSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const { price, durationMin, ...rest } = validation.data;
    const payload = {
      ...rest,
      ...(durationMin !== undefined ? { durationSec: Math.round(durationMin * 60) } : {}),
      ...(price !== undefined ? { priceCents: price != null ? eurosToCents(price) : null } : {}),
    };
    const session = await updateTunnelSession(sessionId, payload);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/skydiving/tunnel/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error updating session' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessionId = Number(id);
    if (Number.isNaN(sessionId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    await deleteTunnelSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/skydiving/tunnel/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error deleting session' }, { status: 500 });
  }
}
