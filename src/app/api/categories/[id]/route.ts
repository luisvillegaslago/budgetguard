/**
 * BudgetGuard Category API - Single Resource
 * GET /api/categories/[id] - Get a category
 * PUT /api/categories/[id] - Update a category
 * DELETE /api/categories/[id] - Delete a category
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { UpdateCategorySchema, validateRequest } from '@/schemas/transaction';
import {
  deleteCategory,
  getCategoryById,
  getCategoryChildrenCount,
  getCategoryTransactionCount,
  updateCategory,
} from '@/services/database/CategoryRepository';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const categoryId = Number.parseInt(id, 10);

    if (Number.isNaN(categoryId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const category = await getCategoryById(categoryId);

    if (!category) {
      return NextResponse.json({ success: false, error: 'Categoria no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/categories/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener categoria' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const categoryId = Number.parseInt(id, 10);

    if (Number.isNaN(categoryId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    const body = await request.json();
    const validation = validateRequest(UpdateCategorySchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const category = await updateCategory(categoryId, validation.data);

    if (!category) {
      return NextResponse.json({ success: false, error: 'Categoria no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('PUT /api/categories/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al actualizar categoria' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const categoryId = Number.parseInt(id, 10);

    if (Number.isNaN(categoryId)) {
      return NextResponse.json({ success: false, error: 'ID invalido' }, { status: 400 });
    }

    // Check for transactions referencing this category
    const transactionCount = await getCategoryTransactionCount(categoryId);
    if (transactionCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'has-transactions',
          count: transactionCount,
        },
        { status: 409 },
      );
    }

    // Check for child subcategories
    const childrenCount = await getCategoryChildrenCount(categoryId);
    if (childrenCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'has-subcategories',
          count: childrenCount,
        },
        { status: 409 },
      );
    }

    const deleted = await deleteCategory(categoryId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Categoria no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('DELETE /api/categories/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Error al eliminar categoria' }, { status: 500 });
  }
}
