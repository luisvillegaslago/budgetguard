/**
 * Integration-style guard test: SyncService column config vs schema.sql
 *
 * The DB backup copies only the columns listed in SYNCABLE_TABLES. When a
 * migration adds a column to a table but the sync config is not updated, that
 * column is silently dropped during backup — and, for NOT NULL / CHECK columns,
 * can break the sync entirely (this is exactly what happened with
 * InvoiceLineItems.Title vs CK_LineItems_TitleOrDescription).
 *
 * This test parses database/schema.sql (the source of truth for the schema) and
 * asserts every persisted column of every syncable table is declared in the
 * sync config. If you intentionally exclude a column from the backup, add it to
 * INTENTIONALLY_EXCLUDED below so the omission is explicit and reviewed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Avoid opening real DB pools when importing the service module
jest.mock('@/services/database/connection', () => ({ getPool: jest.fn() }));
jest.mock('@/services/database/remoteConnection', () => ({ getBackupPool: jest.fn() }));

import { SYNCABLE_TABLES } from '@/services/database/SyncService';

// Columns deliberately NOT synced, keyed by table. Adding here is a conscious
// decision (e.g. transient/regenerable data) and keeps this test green.
const INTENTIONALLY_EXCLUDED: Record<string, string[]> = {};

function parseSchemaColumns(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const tableRegex = /CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"\s*\(([\s\S]*?)\n\);/g;

  let match = tableRegex.exec(sql);
  while (match !== null) {
    const tableName = match[1];
    const body = match[2];
    if (tableName && body) {
      const columns = new Set<string>();
      body.split('\n').forEach((line) => {
        // Column definitions start with a quoted identifier; table-level
        // constraints start with CONSTRAINT/PRIMARY/FOREIGN/UNIQUE/CHECK keywords.
        const colMatch = line.trim().match(/^"(\w+)"\s+\S/);
        if (colMatch?.[1]) columns.add(colMatch[1]);
      });
      tables.set(tableName, columns);
    }
    match = tableRegex.exec(sql);
  }

  return tables;
}

describe('SyncService config columns vs schema.sql', () => {
  const schemaSql = readFileSync(join(process.cwd(), 'database', 'schema.sql'), 'utf-8');
  const schemaColumns = parseSchemaColumns(schemaSql);

  it('parses a sane number of tables from schema.sql', () => {
    expect(schemaColumns.size).toBeGreaterThan(10);
  });

  describe.each(SYNCABLE_TABLES.map((c) => [c.table, c] as const))('%s', (tableName, config) => {
    const cols = schemaColumns.get(tableName);

    it('exists in schema.sql', () => {
      expect(cols).toBeDefined();
    });

    it('declares no columns that are absent from schema.sql', () => {
      const missing = config.columns.filter((col) => cols && !cols.has(col));
      expect(missing).toEqual([]);
    });

    it('declares every schema column (none silently dropped from backup)', () => {
      if (!cols) return;
      const excluded = new Set(INTENTIONALLY_EXCLUDED[tableName] ?? []);
      const notSynced = [...cols].filter((col) => !config.columns.includes(col) && !excluded.has(col));
      expect(notSynced).toEqual([]);
    });
  });
});
