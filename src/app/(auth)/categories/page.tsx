'use client';

/**
 * BudgetGuard Category Management Page
 * Redirects to Settings where category management now lives
 */

import { redirect } from 'next/navigation';

export default function CategoriesPage() {
  redirect('/settings');
}
