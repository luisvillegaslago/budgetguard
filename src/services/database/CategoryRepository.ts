/**
 * BudgetGuard Category Repository
 * Database operations for categories
 */

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
 * Get all categories
 * @param type - Optional filter by type (income/expense)
 * @param includeInactive - If true, returns inactive categories too
 */
export async function getCategories(type?: TransactionType, includeInactive = false): Promise<Category[]> {
  let sqlText = `
    SELECT "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
           "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"
    FROM "Categories"
  `;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (!includeInactive) {
    conditions.push('"IsActive" = TRUE');
  }

  if (type) {
    conditions.push(`"Type" = $${paramIndex}`);
    params.push(type);
    paramIndex++;
  }

  if (conditions.length > 0) {
    sqlText += ` WHERE ${conditions.join(' AND ')}`;
  }

  sqlText += ' ORDER BY "Type", "SortOrder", "Name"';

  const result = await query<CategoryRow>(sqlText, params);
  return result.map(rowToCategory);
}

/**
 * Get a single category by ID
 */
export async function getCategoryById(categoryId: number): Promise<Category | null> {
  const result = await query<CategoryRow>(
    `SELECT "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
            "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"
     FROM "Categories"
     WHERE "CategoryID" = $1`,
    [categoryId],
  );

  const row = result[0];
  return row ? rowToCategory(row) : null;
}

/**
 * Create a new category
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
  const result = await query<CategoryRow>(
    `INSERT INTO "Categories" ("Name", "Type", "Icon", "Color", "SortOrder", "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    ],
  );

  const row = result[0];
  if (!row) {
    throw new Error('Failed to create category');
  }

  return rowToCategory(row);
}

/**
 * Update a category
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
  const updates: string[] = [];
  const params: unknown[] = [categoryId];
  let paramIndex = 2;

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
     WHERE "CategoryID" = $1
     RETURNING "CategoryID", "Name", "Type", "Icon", "Color", "SortOrder", "IsActive",
               "ParentCategoryID", "DefaultShared", "DefaultVatPercent", "DefaultDeductionPercent"`,
    params,
  );

  const row = result[0];
  return row ? rowToCategory(row) : null;
}

/**
 * Get the number of transactions referencing a category
 */
export async function getCategoryTransactionCount(categoryId: number): Promise<number> {
  const result = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Transactions" WHERE "CategoryID" = $1',
    [categoryId],
  );

  return result[0]?.count ?? 0;
}

/**
 * Get the number of child subcategories for a category
 */
export async function getCategoryChildrenCount(categoryId: number): Promise<number> {
  const result = await query<{ count: number }>(
    'SELECT COUNT(*) as count FROM "Categories" WHERE "ParentCategoryID" = $1',
    [categoryId],
  );

  return result[0]?.count ?? 0;
}

/**
 * Delete a category (hard delete)
 * Validation of references should be done in the API layer
 */
export async function deleteCategory(categoryId: number): Promise<boolean> {
  const result = await query<{ CategoryID: number }>(
    'DELETE FROM "Categories" WHERE "CategoryID" = $1 RETURNING "CategoryID"',
    [categoryId],
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
