/**
 * BudgetGuard Skydiving Jumps API
 * GET /api/skydiving/jumps - List all jumps
 * POST /api/skydiving/jumps - Create a new jump
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { CreateJumpSchema } from '@/schemas/skydive';
import { validateRequest } from '@/schemas/transaction';
import { createJump, getAllJumps } from '@/services/database/SkydiveRepository';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const year = searchParams.get('year');
    const dropzone = searchParams.get('dropzone');

    const filters = {
      ...(year ? { year: Number(year) } : {}),
      ...(dropzone ? { dropzone } : {}),
    };

    const jumps = await getAllJumps(filters);

    return NextResponse.json({
      success: true,
      data: jumps,
      meta: { count: jumps.length },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/skydiving/jumps error:', error);
    return NextResponse.json({ success: false, error: 'Error loading jumps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateJumpSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const jump = await createJump(validation.data);

    return NextResponse.json({ success: true, data: jump }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/skydiving/jumps error:', error);
    return NextResponse.json({ success: false, error: 'Error creating jump' }, { status: 500 });
  }
}
