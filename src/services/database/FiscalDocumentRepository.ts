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
}

export async function createDocument(input: CreateDocumentInput): Promise<FiscalDocument> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiscalDocumentRow>(
    `INSERT INTO "FiscalDocuments" (
      "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
      "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
      "ContentType", "TaxAmountCents", "TransactionID", "TransactionGroupID",
      "CompanyID", "Description"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
    ],
  );
  return rowToFiscalDocument(rows[0]!);
}

export async function bulkCreateDocuments(inputs: CreateDocumentInput[]): Promise<FiscalDocument[]> {
  if (inputs.length === 0) return [];
  const userId = await getUserIdOrThrow();

  const COLS_PER_ROW = 16;
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
    );
  });

  const rows = await query<FiscalDocumentRow>(
    `INSERT INTO "FiscalDocuments" (
      "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
      "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
      "ContentType", "TaxAmountCents", "TransactionID", "TransactionGroupID",
      "CompanyID", "Description"
    ) VALUES ${values.join(', ')}
    RETURNING *`,
    params,
  );

  return rows.map(rowToFiscalDocument);
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
