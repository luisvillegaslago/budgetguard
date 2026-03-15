/**
 * BudgetGuard Fiscal Document Repository
 * CRUD operations for fiscal documents and deadline settings.
 * All queries are user-scoped via getUserIdOrThrow().
 */

import { FISCAL_STATUS } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type { FiscalDeadlineSettings, FiscalDocument, FiscalStatus } from '@/types/finance';
import { query } from './connection';

// ============================================================
// Row Types
// ============================================================

interface FiscalDocumentRow {
  DocumentID: number;
  DocumentType: string;
  ModeloType: string | null;
  FiscalYear: number;
  FiscalQuarter: number | null;
  Status: string;
  BlobUrl: string;
  BlobPathname: string;
  FileName: string;
  FileSizeBytes: number;
  ContentType: string;
  TaxAmountCents: number | null;
  TransactionID: number | null;
  TransactionGroupID: number | null;
  CompanyID: number | null;
  Description: string | null;
  DisplayName: string | null;
  CreatedAt: string;
}

interface DeadlineSettingsRow {
  ReminderDaysBefore: number;
  PostponementReminder: boolean;
  IsActive: boolean;
}

interface FiledModeloRow {
  ModeloType: string;
  FiscalYear: number;
  FiscalQuarter: number | null;
}

// ============================================================
// Transformers
// ============================================================

function rowToFiscalDocument(row: FiscalDocumentRow): FiscalDocument {
  return {
    documentId: row.DocumentID,
    documentType: row.DocumentType as FiscalDocument['documentType'],
    modeloType: row.ModeloType as FiscalDocument['modeloType'],
    fiscalYear: row.FiscalYear,
    fiscalQuarter: row.FiscalQuarter,
    status: row.Status as FiscalStatus,
    downloadUrl: `/api/fiscal/documents/${row.DocumentID}/download`,
    fileName: row.FileName,
    fileSizeBytes: row.FileSizeBytes,
    contentType: row.ContentType,
    taxAmountCents: row.TaxAmountCents,
    transactionId: row.TransactionID,
    transactionGroupId: row.TransactionGroupID,
    companyId: row.CompanyID,
    description: row.Description,
    displayName: row.DisplayName,
    createdAt: row.CreatedAt,
  };
}

function rowToDeadlineSettings(row: DeadlineSettingsRow): FiscalDeadlineSettings {
  return {
    reminderDaysBefore: row.ReminderDaysBefore,
    postponementReminder: row.PostponementReminder,
    isActive: row.IsActive,
  };
}

// ============================================================
// Document Queries
// ============================================================

export async function getDocuments(year: number, quarter?: number, documentType?: string): Promise<FiscalDocument[]> {
  const userId = await getUserIdOrThrow();
  const conditions = ['"UserID" = $1', '"FiscalYear" = $2'];
  const params: unknown[] = [userId, year];
  let paramIdx = 3;

  if (quarter != null) {
    conditions.push(`"FiscalQuarter" = $${paramIdx}`);
    params.push(quarter);
    paramIdx++;
  }

  if (documentType) {
    conditions.push(`"DocumentType" = $${paramIdx}`);
    params.push(documentType);
  }

  const rows = await query<FiscalDocumentRow>(
    `SELECT * FROM "FiscalDocuments" WHERE ${conditions.join(' AND ')} ORDER BY "CreatedAt" DESC`,
    params,
  );

  return rows.map(rowToFiscalDocument);
}

export async function getDocumentById(id: number): Promise<FiscalDocument | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiscalDocumentRow>(
    'SELECT * FROM "FiscalDocuments" WHERE "DocumentID" = $1 AND "UserID" = $2',
    [id, userId],
  );
  return rows[0] ? rowToFiscalDocument(rows[0]) : null;
}

/**
 * Get raw blob URL for a document (used by download proxy, never exposed to client)
 */
export async function getDocumentBlobUrl(
  id: number,
): Promise<{ blobUrl: string; fileName: string; contentType: string } | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ BlobUrl: string; FileName: string; ContentType: string }>(
    'SELECT "BlobUrl", "FileName", "ContentType" FROM "FiscalDocuments" WHERE "DocumentID" = $1 AND "UserID" = $2',
    [id, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { blobUrl: row.BlobUrl, fileName: row.FileName, contentType: row.ContentType };
}

// ============================================================
// Document Mutations
// ============================================================

export interface CreateDocumentInput {
  documentType: string;
  modeloType: string | null;
  fiscalYear: number;
  fiscalQuarter: number | null;
  status: string;
  blobUrl: string;
  blobPathname: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  taxAmountCents: number | null;
  transactionId: number | null;
  transactionGroupId: number | null;
  companyId: number | null;
  description: string | null;
  displayName?: string | null;
}

export async function createDocument(input: CreateDocumentInput): Promise<FiscalDocument> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiscalDocumentRow>(
    `INSERT INTO "FiscalDocuments" (
      "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
      "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
      "ContentType", "TaxAmountCents", "TransactionID", "TransactionGroupID",
      "CompanyID", "Description", "DisplayName"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      userId,
      input.documentType,
      input.modeloType,
      input.fiscalYear,
      input.fiscalQuarter,
      input.status,
      input.blobUrl,
      input.blobPathname,
      input.fileName,
      input.fileSizeBytes,
      input.contentType,
      input.taxAmountCents,
      input.transactionId,
      input.transactionGroupId,
      input.companyId,
      input.description,
      input.displayName ?? null,
    ],
  );
  return rowToFiscalDocument(rows[0]!);
}

export async function bulkCreateDocuments(inputs: CreateDocumentInput[]): Promise<FiscalDocument[]> {
  if (inputs.length === 0) return [];
  const userId = await getUserIdOrThrow();

  const COLS_PER_ROW = 17;
  const values: string[] = [];
  const params: unknown[] = [];

  inputs.forEach((input, i) => {
    const base = i * COLS_PER_ROW + 1;
    const placeholders = Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j}`).join(', ');
    values.push(`(${placeholders})`);
    params.push(
      userId,
      input.documentType,
      input.modeloType,
      input.fiscalYear,
      input.fiscalQuarter,
      input.status,
      input.blobUrl,
      input.blobPathname,
      input.fileName,
      input.fileSizeBytes,
      input.contentType,
      input.taxAmountCents,
      input.transactionId,
      input.transactionGroupId,
      input.companyId,
      input.description,
      input.displayName ?? null,
    );
  });

  const rows = await query<FiscalDocumentRow>(
    `INSERT INTO "FiscalDocuments" (
      "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
      "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
      "ContentType", "TaxAmountCents", "TransactionID", "TransactionGroupID",
      "CompanyID", "Description", "DisplayName"
    ) VALUES ${values.join(', ')}
    RETURNING *`,
    params,
  );

  return rows.map(rowToFiscalDocument);
}

/**
 * Update display name for a document (set after OCR extraction)
 */
export async function updateDocumentDisplayName(id: number, displayName: string): Promise<void> {
  const userId = await getUserIdOrThrow();
  await query('UPDATE "FiscalDocuments" SET "DisplayName" = $1 WHERE "DocumentID" = $2 AND "UserID" = $3', [
    displayName,
    id,
    userId,
  ]);
}

export async function updateDocumentStatus(id: number, status: string): Promise<FiscalDocument | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiscalDocumentRow>(
    'UPDATE "FiscalDocuments" SET "Status" = $1 WHERE "DocumentID" = $2 AND "UserID" = $3 RETURNING *',
    [status, id, userId],
  );
  return rows[0] ? rowToFiscalDocument(rows[0]) : null;
}

/**
 * Delete document and return blob URL for cleanup
 */
export async function deleteDocument(id: number): Promise<string | null> {
  const userId = await getUserIdOrThrow();
  const rows = await query<{ BlobUrl: string }>(
    'DELETE FROM "FiscalDocuments" WHERE "DocumentID" = $1 AND "UserID" = $2 RETURNING "BlobUrl"',
    [id, userId],
  );
  return rows[0]?.BlobUrl ?? null;
}

/**
 * Update document metadata after linking a transaction.
 * Sets the confirmed amount, status, and quarter.
 */
export async function updateDocumentAfterLink(
  id: number,
  taxAmountCents: number,
  fiscalQuarter: number | null,
  companyId: number | null,
): Promise<void> {
  const userId = await getUserIdOrThrow();
  await query(
    `UPDATE "FiscalDocuments"
     SET "TaxAmountCents" = $1, "FiscalQuarter" = COALESCE($2, "FiscalQuarter"),
         "CompanyID" = COALESCE($3, "CompanyID"), "Status" = 'filed'
     WHERE "DocumentID" = $4 AND "UserID" = $5`,
    [taxAmountCents, fiscalQuarter, companyId, id, userId],
  );
}

/**
 * Link a transaction to a fiscal document
 */
export async function linkTransaction(id: number, transactionId: number): Promise<void> {
  const userId = await getUserIdOrThrow();
  await query('UPDATE "FiscalDocuments" SET "TransactionID" = $1 WHERE "DocumentID" = $2 AND "UserID" = $3', [
    transactionId,
    id,
    userId,
  ]);
}

/**
 * Unlink fiscal document when the linked transaction is deleted.
 */
export async function unlinkTransactionDocuments(transactionId: number): Promise<void> {
  const userId = await getUserIdOrThrow();
  await query('UPDATE "FiscalDocuments" SET "TransactionID" = NULL WHERE "TransactionID" = $1 AND "UserID" = $2', [
    transactionId,
    userId,
  ]);
}

/**
 * Find a matching transaction by amount (exact or shared ÷2) and date.
 * Uses ±7 days window for income (invoices issued), ±3 days for expenses.
 * Returns the transaction ID if found, null otherwise.
 */
export async function findMatchingTransaction(amountCents: number, transactionDate: string): Promise<number | null> {
  const userId = await getUserIdOrThrow();
  const halfAmountCents = Math.round(amountCents / 2);

  const rows = await query<{ TransactionID: number }>(
    `SELECT "TransactionID" FROM "Transactions"
     WHERE ("AmountCents" = $1 OR ("AmountCents" = $4 AND "SharedDivisor" = 2))
       AND "TransactionDate" BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
       AND "UserID" = $3
     ORDER BY ABS("TransactionDate" - $2::date)
     LIMIT 1`,
    [amountCents, transactionDate, userId, halfAmountCents],
  );

  return rows[0]?.TransactionID ?? null;
}

/**
 * Link a transaction group to a fiscal document
 */
export async function linkTransactionGroup(id: number, transactionGroupId: number): Promise<void> {
  const userId = await getUserIdOrThrow();
  await query('UPDATE "FiscalDocuments" SET "TransactionGroupID" = $1 WHERE "DocumentID" = $2 AND "UserID" = $3', [
    transactionGroupId,
    id,
    userId,
  ]);
}

/**
 * Find matching transaction group by summing transactions from the same vendor
 * on nearby dates (±3 days) that total the invoice amount.
 * Works with both exact and shared (÷2) amounts.
 * Returns the group ID if found or created, null otherwise.
 */
export async function findMatchingTransactionGroup(
  amountCents: number,
  transactionDate: string,
  companyId: number | null,
): Promise<number | null> {
  if (!companyId) return null;
  const userId = await getUserIdOrThrow();
  const halfAmountCents = Math.round(amountCents / 2);

  // Find transactions from same company within ±3 days
  const rows = await query<{
    TransactionID: number;
    AmountCents: number;
    OriginalAmountCents: number | null;
    SharedDivisor: number;
    TransactionGroupID: number | null;
  }>(
    `SELECT "TransactionID", "AmountCents", "OriginalAmountCents", "SharedDivisor", "TransactionGroupID"
     FROM "Transactions"
     WHERE "CompanyID" = $1
       AND "TransactionDate" BETWEEN ($2::date - INTERVAL '3 days') AND ($2::date + INTERVAL '3 days')
       AND "UserID" = $3
     ORDER BY "TransactionDate"`,
    [companyId, transactionDate, userId],
  );

  if (rows.length < 2) return null;

  // Check if original amounts (pre-shared) sum to the invoice total
  const totalOriginalCents = rows.reduce((sum, r) => sum + (r.OriginalAmountCents ?? r.AmountCents), 0);

  // Allow ±1 cent tolerance for rounding
  const matchesExact = Math.abs(totalOriginalCents - amountCents) <= 1;
  const matchesShared = Math.abs(totalOriginalCents - halfAmountCents) <= 1;

  if (!matchesExact && !matchesShared) return null;

  // If transactions already share a group, return it
  const existingGroupId = rows.find((r) => r.TransactionGroupID != null)?.TransactionGroupID;
  if (existingGroupId && rows.every((r) => r.TransactionGroupID === existingGroupId)) {
    return existingGroupId;
  }

  // Create a new group and assign all transactions to it
  const groupRows = await query<{ TransactionGroupID: number }>(
    'INSERT INTO "TransactionGroups" ("UserID") VALUES ($1) RETURNING "TransactionGroupID"',
    [userId],
  );
  const groupId = groupRows[0]?.TransactionGroupID;
  if (!groupId) return null;

  const transactionIds = rows.map((r) => r.TransactionID);
  await query('UPDATE "Transactions" SET "TransactionGroupID" = $1 WHERE "TransactionID" = ANY($2) AND "UserID" = $3', [
    groupId,
    transactionIds,
    userId,
  ]);

  return groupId;
}

// ============================================================
// Filing Status Queries
// ============================================================

/**
 * Get all filed modelos for a year (used by deadline computation)
 */
export async function getFiledModelos(year: number): Promise<Set<string>> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiledModeloRow>(
    `SELECT "ModeloType", "FiscalYear", "FiscalQuarter"
     FROM "FiscalDocuments"
     WHERE "UserID" = $1 AND "FiscalYear" = $2 AND "DocumentType" = 'modelo' AND "Status" = $3`,
    [userId, year, FISCAL_STATUS.FILED],
  );

  const filedSet = new Set<string>();
  rows.forEach((row) => {
    const key =
      row.FiscalQuarter != null
        ? `${row.ModeloType}-${row.FiscalYear}-${row.FiscalQuarter}`
        : `${row.ModeloType}-${row.FiscalYear}`;
    filedSet.add(key);
  });
  return filedSet;
}

// ============================================================
// Deadline Settings
// ============================================================

const DEFAULT_SETTINGS: FiscalDeadlineSettings = {
  reminderDaysBefore: 7,
  postponementReminder: true,
  isActive: true,
};

export async function getDeadlineSettings(): Promise<FiscalDeadlineSettings> {
  const userId = await getUserIdOrThrow();
  const rows = await query<DeadlineSettingsRow>(
    'SELECT "ReminderDaysBefore", "PostponementReminder", "IsActive" FROM "FiscalDeadlineSettings" WHERE "UserID" = $1',
    [userId],
  );
  return rows[0] ? rowToDeadlineSettings(rows[0]) : DEFAULT_SETTINGS;
}

export async function upsertDeadlineSettings(input: FiscalDeadlineSettings): Promise<FiscalDeadlineSettings> {
  const userId = await getUserIdOrThrow();
  const rows = await query<DeadlineSettingsRow>(
    `INSERT INTO "FiscalDeadlineSettings" ("UserID", "ReminderDaysBefore", "PostponementReminder", "IsActive")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("UserID") DO UPDATE SET
       "ReminderDaysBefore" = EXCLUDED."ReminderDaysBefore",
       "PostponementReminder" = EXCLUDED."PostponementReminder",
       "IsActive" = EXCLUDED."IsActive"
     RETURNING "ReminderDaysBefore", "PostponementReminder", "IsActive"`,
    [userId, input.reminderDaysBefore, input.postponementReminder, input.isActive],
  );
  return rowToDeadlineSettings(rows[0]!);
}
