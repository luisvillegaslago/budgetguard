/**
 * BudgetGuard Trip Categories API
 * GET /api/trips/categories - Get subcategories under "Viajes" parent
 */

import { NextResponse } from 'next/server';
import { getTripCategories } from '@/services/database/TripRepository';

export async function GET() {
  try {
    const categories = await getTripCategories();

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging for debugging
    console.error('GET /api/trips/categories error:', error);
    return NextResponse.json({ success: false, error: 'Error al obtener categorias de viaje' }, { status: 500 });
  }
}
