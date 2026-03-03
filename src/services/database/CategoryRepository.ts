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
  };
}

/**
 * Get all active categories
 * @param type - Optional filter by type (income/expense)
 */
export async function getCategories(type?: TransactionType): Promise<Category[]> {
  const pool = await getConnection();
  const request = pool.request();

  let query = `
    SELECT CategoryID, Name, Type, Icon, Color, SortOrder, IsActive
    FROM Categories
    WHERE IsActive = 1
  `;

  if (type) {
    query += ' AND Type = @type';
    request.input('type', sql.NVarChar(10), type);
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
    SELECT CategoryID, Name, Type, Icon, Color, SortOrder, IsActive
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
}): Promise<Category> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('name', sql.NVarChar(100), data.name);
  request.input('type', sql.NVarChar(10), data.type);
  request.input('icon', sql.NVarChar(50), data.icon ?? null);
  request.input('color', sql.NVarChar(7), data.color ?? null);
  request.input('sortOrder', sql.Int, data.sortOrder ?? 0);

  const result = await request.query<CategoryRow>(`
    INSERT INTO Categories (Name, Type, Icon, Color, SortOrder)
    OUTPUT INSERTED.CategoryID, INSERTED.Name, INSERTED.Type,
           INSERTED.Icon, INSERTED.Color, INSERTED.SortOrder, INSERTED.IsActive
    VALUES (@name, @type, @icon, @color, @sortOrder)
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

  if (updates.length === 0) {
    return getCategoryById(categoryId);
  }

  const result = await request.query<CategoryRow>(`
    UPDATE Categories
    SET ${updates.join(', ')}
    OUTPUT INSERTED.CategoryID, INSERTED.Name, INSERTED.Type,
           INSERTED.Icon, INSERTED.Color, INSERTED.SortOrder, INSERTED.IsActive
    WHERE CategoryID = @categoryId
  `);

  const row = result.recordset[0];
  return row ? rowToCategory(row) : null;
}
