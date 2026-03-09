/**
 * BudgetGuard Database Sync Types
 * Types for comparing and syncing local ↔ remote PostgreSQL databases
 */

import type { SyncDirection } from '@/constants/finance';

/**
 * Row difference for a single record
 */
export interface RowDiff {
  pk: number;
  description: string;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
}

/**
 * Diff summary for a single table
 */
export interface TableDiffSummary {
  table: string;
  localCount: number;
  remoteCount: number;
  onlyInLocal: RowDiff[];
  onlyInRemote: RowDiff[];
  modified: RowDiff[];
  unchangedCount: number;
}

/**
 * Full comparison result across all syncable tables
 */
export interface SyncCompareResult {
  tables: TableDiffSummary[];
  localUrl: string;
  remoteUrl: string;
  comparedAt: string;
}

/**
 * Result of executing a sync operation
 */
export interface SyncExecutionResult {
  direction: SyncDirection;
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
 * Input for executing a sync
 */
export interface SyncExecuteInput {
  direction: SyncDirection;
  includeDeletes: boolean;
}

/**
 * Progress event emitted during sync execution
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
