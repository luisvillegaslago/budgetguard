/**
 * BudgetGuard Category Repository
 * Database operations for categories
 */

import sql from 'mssql';
import type { Category, TransactionType } from '@/types/finance';
import { getConnection } from './connection';

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
  const pool = await getConnection();
  const request = pool.request();

  let query = `
    SELECT CategoryID, Name, Type, Icon, Color, SortOrder, IsActive,
           ParentCategoryID, DefaultShared, DefaultVatPercent, DefaultDeductionPercent
    FROM Categories
  `;

  const conditions: string[] = [];

  if (!includeInactive) {
    conditions.push('IsActive = 1');
  }

  if (type) {
    conditions.push('Type = @type');
    request.input('type', sql.NVarChar(10), type);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ' ORDER BY Type, SortOrder, Name';

  const result = await request.query<CategoryRow>(query);
  return result.recordset.map(rowToCategory);
}

/**
 * Get a single category by ID
 */
export async function getCategoryById(categoryId: number): Promise<Category | null> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('categoryId', sql.Int, categoryId);

  const result = await request.query<CategoryRow>(`
    SELECT CategoryID, Name, Type, Icon, Color, SortOrder, IsActive,
           ParentCategoryID, DefaultShared, DefaultVatPercent, DefaultDeductionPercent
    FROM Categories
    WHERE CategoryID = @categoryId
  `);

  const row = result.recordset[0];
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
  const pool = await getConnection();
  const request = pool.request();

  request.input('name', sql.NVarChar(100), data.name);
  request.input('type', sql.NVarChar(10), data.type);
  request.input('icon', sql.NVarChar(50), data.icon ?? null);
  request.input('color', sql.NVarChar(7), data.color ?? null);
  request.input('sortOrder', sql.Int, data.sortOrder ?? 0);
  request.input('parentCategoryId', sql.Int, data.parentCategoryId ?? null);
  request.input('defaultShared', sql.Bit, data.defaultShared ?? false);
  request.input('defaultVatPercent', sql.Decimal(5, 2), data.defaultVatPercent ?? null);
  request.input('defaultDeductionPercent', sql.Decimal(5, 2), data.defaultDeductionPercent ?? null);

  const result = await request.query<CategoryRow>(`
    DECLARE @out TABLE (
      CategoryID INT, Name NVARCHAR(100), Type NVARCHAR(10),
      Icon NVARCHAR(50), Color NVARCHAR(7), SortOrder INT, IsActive BIT,
      ParentCategoryID INT, DefaultShared BIT,
      DefaultVatPercent DECIMAL(5,2), DefaultDeductionPercent DECIMAL(5,2)
    );
    INSERT INTO Categories (Name, Type, Icon, Color, SortOrder, ParentCategoryID, DefaultShared, DefaultVatPercent, DefaultDeductionPercent)
    OUTPUT INSERTED.CategoryID, INSERTED.Name, INSERTED.Type,
           INSERTED.Icon, INSERTED.Color, INSERTED.SortOrder, INSERTED.IsActive,
           INSERTED.ParentCategoryID, INSERTED.DefaultShared,
           INSERTED.DefaultVatPercent, INSERTED.DefaultDeductionPercent
    INTO @out
    VALUES (@name, @type, @icon, @color, @sortOrder, @parentCategoryId, @defaultShared, @defaultVatPercent, @defaultDeductionPercent);
    SELECT * FROM @out;
  `);

  const row = result.recordset[0];
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
  const pool = await getConnection();
  const request = pool.request();

  request.input('categoryId', sql.Int, categoryId);

  const updates: string[] = [];

  if (data.name !== undefined) {
    request.input('name', sql.NVarChar(100), data.name);
    updates.push('Name = @name');
  }
  if (data.icon !== undefined) {
    request.input('icon', sql.NVarChar(50), data.icon);
    updates.push('Icon = @icon');
  }
  if (data.color !== undefined) {
    request.input('color', sql.NVarChar(7), data.color);
    updates.push('Color = @color');
  }
  if (data.sortOrder !== undefined) {
    request.input('sortOrder', sql.Int, data.sortOrder);
    updates.push('SortOrder = @sortOrder');
  }
  if (data.isActive !== undefined) {
    request.input('isActive', sql.Bit, data.isActive);
    updates.push('IsActive = @isActive');
  }
  if (data.defaultShared !== undefined) {
    request.input('defaultShared', sql.Bit, data.defaultShared);
    updates.push('DefaultShared = @defaultShared');
  }
  if (data.defaultVatPercent !== undefined) {
    request.input('defaultVatPercent', sql.Decimal(5, 2), data.defaultVatPercent);
    updates.push('DefaultVatPercent = @defaultVatPercent');
  }
  if (data.defaultDeductionPercent !== undefined) {
    request.input('defaultDeductionPercent', sql.Decimal(5, 2), data.defaultDeductionPercent);
    updates.push('DefaultDeductionPercent = @defaultDeductionPercent');
  }

  if (updates.length === 0) {
    return getCategoryById(categoryId);
  }

  const result = await request.query<CategoryRow>(`
    DECLARE @out TABLE (
      CategoryID INT, Name NVARCHAR(100), Type NVARCHAR(10),
      Icon NVARCHAR(50), Color NVARCHAR(7), SortOrder INT, IsActive BIT,
      ParentCategoryID INT, DefaultShared BIT,
      DefaultVatPercent DECIMAL(5,2), DefaultDeductionPercent DECIMAL(5,2)
    );
    UPDATE Categories
    SET ${updates.join(', ')}
    OUTPUT INSERTED.CategoryID, INSERTED.Name, INSERTED.Type,
           INSERTED.Icon, INSERTED.Color, INSERTED.SortOrder, INSERTED.IsActive,
           INSERTED.ParentCategoryID, INSERTED.DefaultShared,
           INSERTED.DefaultVatPercent, INSERTED.DefaultDeductionPercent
    INTO @out
    WHERE CategoryID = @categoryId;
    SELECT * FROM @out;
  `);

  const row = result.recordset[0];
  return row ? rowToCategory(row) : null;
}

/**
 * Get the number of transactions referencing a category
 */
export async function getCategoryTransactionCount(categoryId: number): Promise<number> {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('categoryId', sql.Int, categoryId)
    .query<{ count: number }>('SELECT COUNT(*) as count FROM Transactions WHERE CategoryID = @categoryId');

  return result.recordset[0]?.count ?? 0;
}

/**
 * Get the number of child subcategories for a category
 */
export async function getCategoryChildrenCount(categoryId: number): Promise<number> {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('categoryId', sql.Int, categoryId)
    .query<{ count: number }>('SELECT COUNT(*) as count FROM Categories WHERE ParentCategoryID = @categoryId');

  return result.recordset[0]?.count ?? 0;
}

/**
 * Delete a category (hard delete)
 * Validation of references should be done in the API layer
 */
export async function deleteCategory(categoryId: number): Promise<boolean> {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('categoryId', sql.Int, categoryId)
    .query('DELETE FROM Categories WHERE CategoryID = @categoryId');

  return (result.rowsAffected[0] ?? 0) > 0;
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
