/**
 * BudgetGuard Skydiving Jump Detail API
 * GET /api/skydiving/jumps/[id] - Get single jump
 * PUT /api/skydiving/jumps/[id] - Update jump
 * DELETE /api/skydiving/jumps/[id] - Delete jump
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { UpdateJumpSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { deleteJump, getJumpById, updateJump } from '@/services/database/SkydiveRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const jumpId = Number(id);
    if (Number.isNaN(jumpId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const jump = await getJumpById(jumpId);
    if (!jump) {
      return NextResponse.json({ success: false, error: 'Jump not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: jump });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/skydiving/jumps/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error loading jump' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const jumpId = Number(id);
    if (Number.isNaN(jumpId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateJumpSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const jump = await updateJump(jumpId, validation.data);
    if (!jump) {
      return NextResponse.json({ success: false, error: 'Jump not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: jump });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/skydiving/jumps/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error updating jump' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const jumpId = Number(id);
    if (Number.isNaN(jumpId)) {
      return NextResponse.json({ success: false, error: 'Invalid ID' }, { status: 400 });
    }

    await deleteJump(jumpId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/skydiving/jumps/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error deleting jump' }, { status: 500 });
  }
}
