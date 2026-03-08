/**
 * BudgetGuard Transaction Groups API - Single Resource
 * DELETE /api/transaction-groups/[id] - Delete a group and all its transactions
 * PATCH /api/transaction-groups/[id] - Update group description/date (propagates to all)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { UpdateTransactionGroupSchema, validateRequest } from '@/schemas/transaction';
import {
  deleteTransactionGroup,
  getTransactionsByGroupId,
  updateTransactionGroup,
} from '@/services/database/TransactionRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const groupId = Number.parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const deleted = await deleteTransactionGroup(groupId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/transaction-groups/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar grupo' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const groupId = Number.parseInt(id, 10);

    if (Number.isNaN(groupId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    // Verify group exists
    const existing = await getTransactionsByGroupId(groupId);
    if (existing.length === 0) {
      return NextResponse.json({ success: false, error: 'Grupo no encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateTransactionGroupSchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const transactions = await updateTransactionGroup(groupId, validation.data);

    return NextResponse.json({ success: true, data: transactions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PATCH /api/transaction-groups/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar grupo' }, { status: 500 });
  }
}
