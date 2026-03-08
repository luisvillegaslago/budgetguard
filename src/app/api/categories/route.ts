/**
 * BudgetGuard Categories API
 * GET /api/categories - List all categories
 * POST /api/categories - Create a new category
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { CreateCategorySchema, validateRequest } from '@/schemas/transaction';
import { createCategory, getCategories, getCategoriesHierarchical } from '@/services/database/CategoryRepository';
import type { TransactionType } from '@/types/finance';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as TransactionType | null;
    const hierarchical = searchParams.get('hierarchical') === 'true';
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const categories = hierarchical
      ? await getCategoriesHierarchical(type ?? undefined, includeInactive)
      : await getCategories(type ?? undefined, includeInactive);

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/categories error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener categorias' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateRequest(CreateCategorySchema, body);

    if (!validation.success) {
      return NextResponse.json({ success: false, errors: validation.errors }, { status: 400 });
    }

    const category = await createCategory(validation.data);

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('POST /api/categories error:', error);
    return NextResponse.json({ success: false, error: 'Error al crear categoria' }, { status: 500 });
  }
}
