/**
 * BudgetGuard Database Backup Types
 * Types for comparing and backing up primary → backup PostgreSQL databases
 */

/**
 * Row difference for a single record
 */
export interface RowDiff {
  pk: number;
  description: string;
  primaryUpdatedAt: string | null;
  backupUpdatedAt: string | null;
}

/**
 * Diff summary for a single table
 */
export interface TableDiffSummary {
  table: string;
  primaryCount: number;
  backupCount: number;
  onlyInPrimary: RowDiff[];
  onlyInBackup: RowDiff[];
  modified: RowDiff[];
  unchangedCount: number;
}

/**
 * Full comparison result across all syncable tables
 */
export interface SyncCompareResult {
  tables: TableDiffSummary[];
  primaryUrl: string;
  backupUrl: string;
  comparedAt: string;
}

/**
 * Result of executing a backup operation
 */
export interface SyncExecutionResult {
  includeDeletes: boolean;
  tables: Array<{
    table: string;
    inserted: number;
    updated: number;
    deleted: number;
  }>;
  executedAt: string;
}

/**
 * Input for executing a backup
 */
export interface SyncExecuteInput {
  includeDeletes: boolean;
}

/**
 * Progress event emitted during backup execution
 */
export interface SyncProgressEvent {
  phase: 'setup' | 'delete' | 'sync' | 'done' | 'error';
  table?: string;
  inserted?: number;
  updated?: number;
  deleted?: number;
  tableIndex?: number;
  tableCount?: number;
  message?: string;
}
