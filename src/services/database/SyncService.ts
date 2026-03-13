/**
 * BudgetGuard Database Sync Service
 * Compares local and remote PostgreSQL databases and performs bidirectional sync.
 * Only available in development mode.
 */

import type { SyncDirection } from '@/constants/finance';
import { SYNC_DIRECTION } from '@/constants/finance';
import type {
  RowDiff,
  SyncCompareResult,
  SyncExecutionResult,
  SyncProgressEvent,
  TableDiffSummary,
} from '@/types/sync';
import { getPool } from './connection';
import { getRemotePool } from './remoteConnection';

// ============================================================
// Table Configuration
// ============================================================

interface TableConfig {
  table: string;
  pk: string;
  descriptionColumn: string;
  hasUpdatedAt: boolean;
  columns: string[];
}

const SYNCABLE_TABLES: TableConfig[] = [
  {
    table: 'Categories',
    pk: 'CategoryID',
    descriptionColumn: 'Name',
    hasUpdatedAt: true,
    columns: [
      'CategoryID',
      'Name',
      'Type',
      'Icon',
      'Color',
      'SortOrder',
      'IsActive',
      'ParentCategoryID',
      'DefaultShared',
      'DefaultVatPercent',
      'DefaultDeductionPercent',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'Trips',
    pk: 'TripID',
    descriptionColumn: 'Name',
    hasUpdatedAt: true,
    columns: ['TripID', 'Name', 'UserID', 'CreatedAt', 'UpdatedAt'],
  },
  {
    table: 'TransactionGroups',
    pk: 'TransactionGroupID',
    descriptionColumn: 'TransactionGroupID',
    hasUpdatedAt: false,
    columns: ['TransactionGroupID', 'UserID', 'CreatedAt'],
  },
  {
    table: 'Companies',
    pk: 'CompanyID',
    descriptionColumn: 'Name',
    hasUpdatedAt: true,
    columns: [
      'CompanyID',
      'Name',
      'TradingName',
      'TaxId',
      'Address',
      'City',
      'PostalCode',
      'Country',
      'InvoiceLanguage',
      'Role',
      'UserID',
      'IsActive',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'RecurringExpenses',
    pk: 'RecurringExpenseID',
    descriptionColumn: 'Description',
    hasUpdatedAt: true,
    columns: [
      'RecurringExpenseID',
      'CategoryID',
      'AmountCents',
      'Description',
      'Frequency',
      'DayOfWeek',
      'DayOfMonth',
      'MonthOfYear',
      'StartDate',
      'EndDate',
      'IsActive',
      'SharedDivisor',
      'OriginalAmountCents',
      'VatPercent',
      'DeductionPercent',
      'VendorName',
      'CompanyID',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'Transactions',
    pk: 'TransactionID',
    descriptionColumn: 'Description',
    hasUpdatedAt: true,
    columns: [
      'TransactionID',
      'CategoryID',
      'AmountCents',
      'Description',
      'TransactionDate',
      'Type',
      'SharedDivisor',
      'OriginalAmountCents',
      'TransactionGroupID',
      'TripID',
      'RecurringExpenseID',
      'VatPercent',
      'DeductionPercent',
      'VendorName',
      'InvoiceNumber',
      'CompanyID',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'RecurringExpenseOccurrences',
    pk: 'OccurrenceID',
    descriptionColumn: 'OccurrenceDate',
    hasUpdatedAt: false,
    columns: [
      'OccurrenceID',
      'RecurringExpenseID',
      'OccurrenceDate',
      'Status',
      'TransactionID',
      'ModifiedAmountCents',
      'ProcessedAt',
    ],
  },
  {
    table: 'UserBillingProfiles',
    pk: 'BillingProfileID',
    descriptionColumn: 'FullName',
    hasUpdatedAt: true,
    columns: [
      'BillingProfileID',
      'UserID',
      'FullName',
      'Nif',
      'Address',
      'Phone',
      'PaymentMethod',
      'BankName',
      'Iban',
      'Swift',
      'BankAddress',
      'DefaultHourlyRateCents',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'InvoicePrefixes',
    pk: 'PrefixID',
    descriptionColumn: 'Prefix',
    hasUpdatedAt: false,
    columns: ['PrefixID', 'Prefix', 'NextNumber', 'Description', 'UserID', 'CompanyID', 'IsActive', 'CreatedAt'],
  },
  {
    table: 'Invoices',
    pk: 'InvoiceID',
    descriptionColumn: 'InvoiceNumber',
    hasUpdatedAt: true,
    columns: [
      'InvoiceID',
      'PrefixID',
      'InvoiceNumber',
      'InvoiceDate',
      'CompanyID',
      'TransactionID',
      'TotalCents',
      'Currency',
      'Status',
      'BillerName',
      'BillerNif',
      'BillerAddress',
      'BillerPhone',
      'BillerPaymentMethod',
      'BillerBankName',
      'BillerIban',
      'BillerSwift',
      'BillerBankAddress',
      'ClientName',
      'ClientTradingName',
      'ClientTaxId',
      'ClientAddress',
      'ClientCity',
      'ClientPostalCode',
      'ClientCountry',
      'Notes',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'InvoiceLineItems',
    pk: 'LineItemID',
    descriptionColumn: 'Description',
    hasUpdatedAt: false,
    columns: ['LineItemID', 'InvoiceID', 'SortOrder', 'Description', 'Hours', 'HourlyRateCents', 'AmountCents'],
  },
  {
    table: 'SkydiveJumps',
    pk: 'JumpID',
    descriptionColumn: 'Title',
    hasUpdatedAt: true,
    columns: [
      'JumpID',
      'JumpNumber',
      'Title',
      'JumpDate',
      'Dropzone',
      'Canopy',
      'Wingsuit',
      'FreefallTimeSec',
      'JumpType',
      'Aircraft',
      'ExitAltitudeFt',
      'LandingDistanceM',
      'Comment',
      'PriceCents',
      'TransactionID',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
    ],
  },
  {
    table: 'TunnelSessions',
    pk: 'SessionID',
    descriptionColumn: 'Location',
    hasUpdatedAt: true,
    columns: [
      'SessionID',
      'SessionDate',
      'Location',
      'SessionType',
      'DurationSec',
      'Notes',
      'TransactionID',
      'UserID',
      'CreatedAt',
      'UpdatedAt',
      'PriceCents',
    ],
  },
];

// Reverse order for deletes (respect FK dependencies)
const DELETE_ORDER = [...SYNCABLE_TABLES].reverse();

// ============================================================
// Helpers
// ============================================================

interface RowRecord {
  [key: string]: unknown;
}

function getDescription(row: RowRecord, config: TableConfig): string {
  const val = row[config.descriptionColumn];
  return val != null ? String(val) : `#${row[config.pk]}`;
}

function rowHash(row: RowRecord, columns: string[]): string {
  return columns
    .filter((c) => c !== 'CreatedAt' && c !== 'UpdatedAt')
    .map((c) => JSON.stringify(row[c] ?? null))
    .join('|');
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    if (parsed.username && parsed.username.length > 4) {
      parsed.username = `${parsed.username.slice(0, 4)}***`;
    }
    return parsed.toString();
  } catch {
    return '***';
  }
}

// ============================================================
// Compare
// ============================================================

export async function computeDiff(): Promise<SyncCompareResult> {
  const localPool = getPool();
  const remotePool = getRemotePool();
  const tables: TableDiffSummary[] = [];

  // Build UserID remap so compare ignores UserID differences (local=1, remote=2)
  const userIdRemap = await buildUserIdRemap(localPool, remotePool);

  const diffPromises = SYNCABLE_TABLES.map(async (config) => {
    const selectAll = `SELECT * FROM "${config.table}" ORDER BY "${config.pk}"`;
    const hasUserIdCol = config.columns.includes('UserID');

    const [localRows, remoteRows] = await Promise.all([
      localPool.query(selectAll).then((r) => r.rows as RowRecord[]),
      remotePool.query(selectAll).then((r) => r.rows as RowRecord[]),
    ]);

    const localMap = new Map<number, RowRecord>();
    localRows.forEach((row) => {
      // Remap local UserID to remote equivalent for fair comparison
      const normalized = hasUserIdCol ? remapUserIds(row, userIdRemap) : row;
      localMap.set(Number(row[config.pk]), normalized);
    });

    const remoteMap = new Map<number, RowRecord>();
    remoteRows.forEach((row) => {
      remoteMap.set(Number(row[config.pk]), row);
    });

    const onlyInLocal: RowDiff[] = [];
    const onlyInRemote: RowDiff[] = [];
    const modified: RowDiff[] = [];
    let unchangedCount = 0;

    // Check local rows
    localMap.forEach((localRow, pk) => {
      const remoteRow = remoteMap.get(pk);
      if (!remoteRow) {
        onlyInLocal.push({
          pk,
          description: getDescription(localRow, config),
          localUpdatedAt: localRow.UpdatedAt ? String(localRow.UpdatedAt) : null,
          remoteUpdatedAt: null,
        });
      } else if (config.hasUpdatedAt) {
        const localTime = new Date(String(localRow.UpdatedAt)).getTime();
        const remoteTime = new Date(String(remoteRow.UpdatedAt)).getTime();
        if (localTime !== remoteTime) {
          modified.push({
            pk,
            description: getDescription(localRow, config),
            localUpdatedAt: String(localRow.UpdatedAt),
            remoteUpdatedAt: String(remoteRow.UpdatedAt),
          });
        } else {
          unchangedCount++;
        }
      } else {
        // No UpdatedAt — compare by hash
        const localH = rowHash(localRow, config.columns);
        const remoteH = rowHash(remoteRow, config.columns);
        if (localH !== remoteH) {
          modified.push({
            pk,
            description: getDescription(localRow, config),
            localUpdatedAt: null,
            remoteUpdatedAt: null,
          });
        } else {
          unchangedCount++;
        }
      }
    });

    // Check remote-only rows
    remoteMap.forEach((remoteRow, pk) => {
      if (!localMap.has(pk)) {
        onlyInRemote.push({
          pk,
          description: getDescription(remoteRow, config),
          localUpdatedAt: null,
          remoteUpdatedAt: remoteRow.UpdatedAt ? String(remoteRow.UpdatedAt) : null,
        });
      }
    });

    return {
      table: config.table,
      localCount: localRows.length,
      remoteCount: remoteRows.length,
      onlyInLocal,
      onlyInRemote,
      modified,
      unchangedCount,
    };
  });

  const results = await Promise.all(diffPromises);
  // Maintain original table order
  SYNCABLE_TABLES.forEach((config) => {
    const result = results.find((r) => r.table === config.table);
    if (result) tables.push(result);
  });

  return {
    tables,
    localUrl: maskUrl(process.env.DATABASE_URL ?? ''),
    remoteUrl: maskUrl(process.env.REMOTE_DATABASE_URL ?? ''),
    comparedAt: new Date().toISOString(),
  };
}

// ============================================================
// Execute Sync
// ============================================================

// Build a UserID remap from source → target by matching on email
async function buildUserIdRemap(
  sourcePool: { query: (text: string) => Promise<{ rows: RowRecord[] }> },
  targetPool: { query: (text: string) => Promise<{ rows: RowRecord[] }> },
): Promise<Map<number, number>> {
  const [sourceUsers, targetUsers] = await Promise.all([
    sourcePool.query('SELECT "UserID", "Email" FROM "Users"').then((r) => r.rows),
    targetPool.query('SELECT "UserID", "Email" FROM "Users"').then((r) => r.rows),
  ]);

  const targetByEmail = new Map<string, number>();
  targetUsers.forEach((u) => {
    targetByEmail.set(String(u.Email).toLowerCase(), Number(u.UserID));
  });

  const remap = new Map<number, number>();
  sourceUsers.forEach((u) => {
    const sourceId = Number(u.UserID);
    const targetId = targetByEmail.get(String(u.Email).toLowerCase());
    if (targetId !== undefined && sourceId !== targetId) {
      remap.set(sourceId, targetId);
    }
  });

  return remap;
}

function remapUserIds(row: RowRecord, userIdRemap: Map<number, number>): RowRecord {
  if (userIdRemap.size === 0) return row;
  const userId = row.UserID;
  if (userId == null) return row;
  const remapped = userIdRemap.get(Number(userId));
  if (remapped === undefined) return row;
  return { ...row, UserID: remapped };
}

export async function executeSync(
  direction: SyncDirection,
  includeDeletes: boolean,
  onProgress?: (event: SyncProgressEvent) => void,
): Promise<SyncExecutionResult> {
  const localPool = getPool();
  const remotePool = getRemotePool();

  const sourcePool = direction === SYNC_DIRECTION.PUSH ? localPool : remotePool;
  const targetPool = direction === SYNC_DIRECTION.PUSH ? remotePool : localPool;

  // Remap UserIDs between source and target by matching email
  const userIdRemap = await buildUserIdRemap(sourcePool, targetPool);

  const targetClient = await targetPool.connect();
  const tableResults: SyncExecutionResult['tables'] = [];
  const tablesWithTriggers = SYNCABLE_TABLES.filter((c) => c.hasUpdatedAt);

  try {
    await targetClient.query('BEGIN');

    // Disable UpdatedAt triggers so sync preserves original timestamps
    await Promise.all(
      tablesWithTriggers.map((c) =>
        targetClient.query(`ALTER TABLE "${c.table}" DISABLE TRIGGER "TR_${c.table}_UpdatedAt"`),
      ),
    );

    onProgress?.({ phase: 'setup', message: 'Disabling triggers...' });

    // Disable VendorName sync triggers so sync preserves exact data
    await Promise.all([
      targetClient.query('ALTER TABLE "Transactions" DISABLE TRIGGER "TR_Transactions_SyncVendorName"').catch(() => {}),
      targetClient
        .query('ALTER TABLE "RecurringExpenses" DISABLE TRIGGER "TR_RecurringExpenses_SyncVendorName"')
        .catch(() => {}),
      targetClient.query('ALTER TABLE "Companies" DISABLE TRIGGER "TR_Companies_PropagateNameChange"').catch(() => {}),
    ]);

    // Phase 1: Deletes (reverse FK order, sequential to respect FK constraints)
    if (includeDeletes) {
      let deleteIdx = 0;
      await processTablesSequentially(DELETE_ORDER, async (config) => {
        deleteIdx++;
        onProgress?.({ phase: 'delete', table: config.table, tableIndex: deleteIdx, tableCount: DELETE_ORDER.length });

        const selectAll = `SELECT * FROM "${config.table}" ORDER BY "${config.pk}"`;
        const [sourceRows, targetRows] = await Promise.all([
          sourcePool.query(selectAll).then((r) => r.rows as RowRecord[]),
          targetPool.query(selectAll).then((r) => r.rows as RowRecord[]),
        ]);

        const sourceIds = new Set(sourceRows.map((r) => Number(r[config.pk])));
        const toDelete = targetRows.filter((r) => !sourceIds.has(Number(r[config.pk])));

        if (toDelete.length > 0) {
          const ids = toDelete.map((r) => Number(r[config.pk]));
          await targetClient.query(`DELETE FROM "${config.table}" WHERE "${config.pk}" = ANY($1::int[])`, [ids]);
        }

        const existing = tableResults.find((r) => r.table === config.table);
        if (existing) {
          existing.deleted = toDelete.length;
        } else {
          tableResults.push({ table: config.table, inserted: 0, updated: 0, deleted: toDelete.length });
        }
      });
    }

    // Phase 2: Inserts and Updates (FK order, sequential for FK dependencies)
    // Categories need special handling for self-referencing FK:
    // Insert parents (ParentCategoryID IS NULL) first, then children
    let syncIdx = 0;
    await processTablesSequentially(SYNCABLE_TABLES, async (config) => {
      syncIdx++;
      onProgress?.({ phase: 'sync', table: config.table, tableIndex: syncIdx, tableCount: SYNCABLE_TABLES.length });

      const selectAll = `SELECT * FROM "${config.table}" ORDER BY "${config.pk}"`;

      const [sourceRows, targetRows] = await Promise.all([
        sourcePool.query(selectAll).then((r) => r.rows as RowRecord[]),
        targetPool.query(selectAll).then((r) => r.rows as RowRecord[]),
      ]);

      const targetMap = new Map<number, RowRecord>();
      targetRows.forEach((row) => {
        targetMap.set(Number(row[config.pk]), row);
      });

      const toInsert: RowRecord[] = [];
      const toUpdate: RowRecord[] = [];

      sourceRows.forEach((sourceRow) => {
        const pk = Number(sourceRow[config.pk]);
        const targetRow = targetMap.get(pk);

        if (!targetRow) {
          toInsert.push(sourceRow);
        } else if (config.hasUpdatedAt) {
          const sourceTime = new Date(String(sourceRow.UpdatedAt)).getTime();
          const targetTime = new Date(String(targetRow.UpdatedAt)).getTime();
          if (sourceTime !== targetTime) {
            toUpdate.push(sourceRow);
          }
        } else {
          const sourceH = rowHash(sourceRow, config.columns);
          const targetH = rowHash(targetRow, config.columns);
          if (sourceH !== targetH) {
            toUpdate.push(sourceRow);
          }
        }
      });

      // For Categories: sort inserts so parents come before children
      if (config.table === 'Categories') {
        toInsert.sort((a, b) => {
          const aParent = a.ParentCategoryID;
          const bParent = b.ParentCategoryID;
          if (aParent == null && bParent != null) return -1;
          if (aParent != null && bParent == null) return 1;
          return Number(a[config.pk]) - Number(b[config.pk]);
        });
      }

      // Remap UserIDs for target DB
      const hasUserIdCol = config.columns.includes('UserID');
      const remappedInserts = hasUserIdCol ? toInsert.map((r) => remapUserIds(r, userIdRemap)) : toInsert;
      const remappedUpdates = hasUserIdCol ? toUpdate.map((r) => remapUserIds(r, userIdRemap)) : toUpdate;

      // Insert new rows
      if (remappedInserts.length > 0) {
        await batchInsert(targetClient, config, remappedInserts);
      }

      // Update modified rows
      if (remappedUpdates.length > 0) {
        await batchUpdate(targetClient, config, remappedUpdates);
      }

      // Reset sequence
      await targetClient.query(
        `SELECT setval(pg_get_serial_sequence('"${config.table}"', '${config.pk}'), COALESCE((SELECT MAX("${config.pk}") FROM "${config.table}"), 0) + 1, false)`,
      );

      const existing = tableResults.find((r) => r.table === config.table);
      if (existing) {
        existing.inserted = toInsert.length;
        existing.updated = toUpdate.length;
      } else {
        tableResults.push({
          table: config.table,
          inserted: toInsert.length,
          updated: toUpdate.length,
          deleted: 0,
        });
      }

      onProgress?.({
        phase: 'sync',
        table: config.table,
        inserted: toInsert.length,
        updated: toUpdate.length,
        tableIndex: syncIdx,
        tableCount: SYNCABLE_TABLES.length,
      });
    });

    // Re-enable UpdatedAt triggers before committing
    await Promise.all(
      tablesWithTriggers.map((c) =>
        targetClient.query(`ALTER TABLE "${c.table}" ENABLE TRIGGER "TR_${c.table}_UpdatedAt"`),
      ),
    );

    // Re-enable VendorName sync triggers
    await Promise.all([
      targetClient.query('ALTER TABLE "Transactions" ENABLE TRIGGER "TR_Transactions_SyncVendorName"').catch(() => {}),
      targetClient
        .query('ALTER TABLE "RecurringExpenses" ENABLE TRIGGER "TR_RecurringExpenses_SyncVendorName"')
        .catch(() => {}),
      targetClient.query('ALTER TABLE "Companies" ENABLE TRIGGER "TR_Companies_PropagateNameChange"').catch(() => {}),
    ]);

    await targetClient.query('COMMIT');
  } catch (error) {
    // Re-enable triggers even on rollback to leave DB in clean state
    await Promise.all([
      ...tablesWithTriggers.map((c) =>
        targetClient.query(`ALTER TABLE "${c.table}" ENABLE TRIGGER "TR_${c.table}_UpdatedAt"`).catch(() => {}),
      ),
      targetClient.query('ALTER TABLE "Transactions" ENABLE TRIGGER "TR_Transactions_SyncVendorName"').catch(() => {}),
      targetClient
        .query('ALTER TABLE "RecurringExpenses" ENABLE TRIGGER "TR_RecurringExpenses_SyncVendorName"')
        .catch(() => {}),
      targetClient.query('ALTER TABLE "Companies" ENABLE TRIGGER "TR_Companies_PropagateNameChange"').catch(() => {}),
    ]);
    await targetClient.query('ROLLBACK');
    throw error;
  } finally {
    targetClient.release();
  }

  // Maintain original table order in results
  const orderedResults: SyncExecutionResult['tables'] = [];
  SYNCABLE_TABLES.forEach((config) => {
    const result = tableResults.find((r) => r.table === config.table);
    if (result) orderedResults.push(result);
  });

  return {
    direction,
    includeDeletes,
    tables: orderedResults,
    executedAt: new Date().toISOString(),
  };
}

// ============================================================
// Sequential processing helper (avoids for...of loops)
// ============================================================

async function processTablesSequentially(
  tables: TableConfig[],
  fn: (config: TableConfig) => Promise<void>,
): Promise<void> {
  const first = tables[0];
  if (!first) return;
  await fn(first);
  await processTablesSequentially(tables.slice(1), fn);
}

// ============================================================
// Batch Insert / Update helpers
// ============================================================

async function batchInsert(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  config: TableConfig,
  rows: RowRecord[],
): Promise<void> {
  const batchSize = 50;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];

    batch.forEach((row, rowIdx) => {
      const rowPlaceholders = config.columns.map((_, colIdx) => {
        const paramIdx = rowIdx * config.columns.length + colIdx + 1;
        return `$${paramIdx}`;
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);

      config.columns.forEach((col) => {
        values.push(row[col] === undefined ? null : row[col]);
      });
    });

    const quotedCols = config.columns.map((c) => `"${c}"`).join(', ');
    const sql = `INSERT INTO "${config.table}" (${quotedCols}) OVERRIDING SYSTEM VALUE VALUES ${placeholders.join(', ')}`;
    await client.query(sql, values);
  }
}

async function batchUpdate(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  config: TableConfig,
  rows: RowRecord[],
): Promise<void> {
  // Update rows one at a time (simpler, sufficient for sync use case)
  const updateCols = config.columns.filter((c) => c !== config.pk);

  const setClauses = updateCols.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');
  const whereClause = `"${config.pk}" = $${updateCols.length + 1}`;
  const sql = `UPDATE "${config.table}" SET ${setClauses} WHERE ${whereClause}`;

  const updatePromises = rows.map((row) => {
    const params = [...updateCols.map((col) => (row[col] === undefined ? null : row[col])), row[config.pk]];
    return client.query(sql, params);
  });

  await Promise.all(updatePromises);
}
