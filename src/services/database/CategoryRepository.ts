/**
 * BudgetGuard Category Repository
 * Database operations for categories (user-scoped)
 */

import { getUserIdOrThrow } from '@/libs/auth';
import type { Category, TransactionType } from '@/types/finance';
import { query } from './connection';

interface CategoryRow {
  CategoryID: number;
  Name: string;
  Type: TransactionType;
  Icon: string | null;
  Color: string | null;
  SortOrder: number;
  IsActive: boolean;
  ParentCategoryID: number | null;
  DefaultShared: boolean;
  DefaultVatPercent: number | null;
  DefaultDeductionPercent: number | null;
}

/**
 * Transform database row to Category type
 */
function rowToCategory(row: CategoryRow): Category {
  return {
    categoryId: row.CategoryID,
    name: row.Name,
    type: row.Type,
    icon: row.Icon,
    color: row.Color,
    sortOrder: row.SortOrder,
    isActive: row.IsActive,
    parentCategoryId: row.ParentCategoryID,
    defaultShared: row.DefaultShared,
    defaultVatPercent: row.DefaultVatPercent,
    defaultDeductionPercent: row.DefaultDeductionPercent,
  };
}

/**
 * Build hierarchical tree from flat category list
 * Parents get .subcategories[] populated with their children
 */
function buildCategoryTree(categories: Category[]): Category[] {
  const parents = categories.filter((c) => c.parentCategoryId === null);
  const children = categories.filter((c) => c.parentCategoryId !== null);

  return parents.map((parent) => ({
    ...parent,
    subcategories: children
      .filter((c) => c.parentCategoryId === parent.categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

/**
 * Get all categories for the current user
 * @param type - Optional filter by type (income/expense)
 * @param includeInactive - If true, returns inactive categories too
 */
export async function getCategories(type?: TransactionType, includeInactive = false): Promise<Category[]> {
  const userId = await getUserIdOrThrow();

  let sqlText = `
    SELECT "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
           "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"
    FROM "Categories"
    WHERE "UserID" = $1
  `;

  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (!includeInactive) {
    sqlText += ' AND "IsActive" = TRUE';
  }

  if (type) {
    sqlText += ` AND "Type" = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }

  sqlText += ' ORDER BY "Type", "SortOrder", "Name"';

  const result = await query<CategoryRow>(sqlText, params);
  return result.map(rowToCategory);
}

/**
 * Get a single category by ID (verifies ownership)
 */
export async function getCategoryById(categoryId: number): Promise<Category | null> {
  const userId = await getUserIdOrThrow();

  const result = await query<CategoryRow>(
    `SELECT "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
            "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"
     FROM "Categories"
     WHERE "CategoryID" = $1 AND "UserID" = $2`,
    [categoryId, userId],
  );

  const row = result[0];
  return row ? rowToCategory(row) : null;
}

/**
 * Create a new category for the current user
 */
export async function createCategory(data: {
  name: string;
  type: TransactionType;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  parentCategoryId?: number | null;
  defaultShared?: boolean;
  defaultVatPercent?: number | null;
  defaultDeductionPercent?: number | null;
}): Promise<Category> {
  const userId = await getUserIdOrThrow();

  const result = await query<CategoryRow>(
    `INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent", "UserID")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
               "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"`,
    [
      data.name,
      data.type,
      data.icon ?? null,
      data.color ?? null,
      data.sortOrder ?? 0,
      data.parentCategoryId ?? null,
      data.defaultShared ?? false,
      data.defaultVatPercent ?? null,
      data.defaultDeductionPercent ?? null,
      userId,
    ],
  );

  const row = result[0];
  if (!row) {
    throw new Error('Failed to create category');
  }

  return rowToCategory(row);
}

/**
 * Update a category (verifies ownership)
 */
export async function updateCategory(
  categoryId: number,
  data: Partial<{
    name: string;
    icon: string | null;
    color: string | null;
    sortOrder: number;
    isActive: boolean;
    defaultShared: boolean;
    defaultVatPercent: number | null;
    defaultDeductionPercent: number | null;
  }>,
): Promise<Category | null> {
  const userId = await getUserIdOrThrow();

  const updates: string[] = [];
  const params: unknown[] = [categoryId, userId];
  let paramIndex = 3;

  if (data.name !== undefined) {
    updates.push(`"Name" = $${paramIndex++}`);
    params.push(data.name);
  }
  if (data.icon !== undefined) {
    updates.push(`"Icon" = $${paramIndex++}`);
    params.push(data.icon);
  }
  if (data.color !== undefined) {
    updates.push(`"Color" = $${paramIndex++}`);
    params.push(data.color);
  }
  if (data.sortOrder !== undefined) {
    updates.push(`"SortOrder" = $${paramIndex++}`);
    params.push(data.sortOrder);
  }
  if (data.isActive !== undefined) {
    updates.push(`"IsActive" = $${paramIndex++}`);
    params.push(data.isActive);
  }
  if (data.defaultShared !== undefined) {
    updates.push(`"DefaultShared" = $${paramIndex++}`);
    params.push(data.defaultShared);
  }
  if (data.defaultVatPercent !== undefined) {
    updates.push(`"DefaultVatPercent" = $${paramIndex++}`);
    params.push(data.defaultVatPercent);
  }
  if (data.defaultDeductionPercent !== undefined) {
    updates.push(`"DefaultDeductionPercent" = $${paramIndex++}`);
    params.push(data.defaultDeductionPercent);
  }

  if (updates.length === 0) {
    return getCategoryById(categoryId);
  }

  const result = await query<CategoryRow>(
    `UPDATE "Categories"
     SET ${updates.join(', ')}
     WHERE "CategoryID" = $1 AND "UserID" = $2
     RETURNING "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
               "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"`,
    params,
  );

  const row = result[0];
  return row ? rowToCategory(row) : null;
}

/**
 * Get the number of transactions referencing a category (user-scoped)
 */
export async function getCategoryTransactionCount(categoryId: number): Promise<number> {
  const userId = await getUserIdOrThrow();

  const result = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Transactions" WHERE "CategoryID" = $1 AND "UserID" = $2',
    [categoryId, userId],
  );

  return result[0]?.count ?? 0;
}

/**
 * Get the number of child subcategories for a category (user-scoped)
 */
export async function getCategoryChildrenCount(categoryId: number): Promise<number> {
  const userId = await getUserIdOrThrow();

  const result = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Categories" WHERE "ParentCategoryID" = $1 AND "UserID" = $2',
    [categoryId, userId],
  );

  return result[0]?.count ?? 0;
}

/**
 * Delete a category (hard delete, verifies ownership)
 * Validation of references should be done in the API layer
 */
export async function deleteCategory(categoryId: number): Promise<boolean> {
  const userId = await getUserIdOrThrow();

  const result = await query<{ CategoryID: number }>(
    'DELETE FROM "Categories" WHERE "CategoryID" = $1 AND "UserID" = $2 RETURNING "CategoryID"',
    [categoryId, userId],
  );

  return result.length > 0;
}

/**
 * Get categories as hierarchical tree (parents with nested subcategories)
 * @param type - Optional filter by type (income/expense)
 * @param includeInactive - If true, returns inactive categories too
 */
export async function getCategoriesHierarchical(type?: TransactionType, includeInactive = false): Promise<Category[]> {
  const flatCategories = await getCategories(type, includeInactive);
  return buildCategoryTree(flatCategories);
}
