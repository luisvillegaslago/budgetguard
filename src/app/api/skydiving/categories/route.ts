/**
 * BudgetGuard Skydiving Categories API
 * GET /api/skydiving/categories - Get Paracaidismo subcategories
 */

import { NextResponse } from 'next/server';
import { AuthError } from '@/libs/auth';
import { getSkydiveCategories } from '@/services/database/SkydiveRepository';

export async function GET() {
  try {
    const categories = await getSkydiveCategories();

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/skydiving/categories error:', error);
    return NextResponse.json({ success: false, error: 'Error loading categories' }, { status: 500 });
  }
}
