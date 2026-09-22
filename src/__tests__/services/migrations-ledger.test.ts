/**
 * Contract Tests: database/migrations agrees with its ledger
 *
 * The numbering in MIGRATIONS.md is a running counter maintained by convention: you read
 * `Last applied`, add one, and write the file. With several sessions working this repo at
 * once, two that read the same number both write it — and a collision is invisible until
 * someone applies the wrong file, or applies one twice, against the live database.
 *
 * practice-hub runs the same ledger and has hit exactly this; their defence is "re-read the
 * ledger first" and nothing else. These tests are that missing check. They read the real
 * folder and the real ledger, so they fail on divergence without a database.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'database', 'migrations');
const LEDGER = readFileSync(join(MIGRATIONS_DIR, 'MIGRATIONS.md'), 'utf8');

/**
 * Migrations committed before the ledger existed. They keep their original names because
 * renaming an applied migration rewrites history for nothing. Any OTHER unnumbered file is
 * a mistake: the point of this list is that it does not grow.
 */
const LEGACY_FILES = [
  'add_bank_fee_subcategory.sql',
  'add_cancelled_sync_status.sql',
  'add_company_default_bank_fee.sql',
  'add_crypto_module_phase2.sql',
  'add_transaction_status.sql',
] as const;

const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

/** `007-add-something.sql` -> 7. Returns null for the legacy, unnumbered names. */
const numberOf = (fileName: string): number | null => {
  const match = /^(\d{3})-/.exec(fileName);
  return match ? Number(match[1]) : null;
};

/** Every `| NNN | ... |` row of the ledger table, in file order. */
const ledgerRowNumbers = (): number[] => [...LEDGER.matchAll(/^\|\s*(\d{3})\s*\|/gm)].map((match) => Number(match[1]));

const lastApplied = (): number => {
  const match = /^##\s*Last applied:\s*(\d+)\s*$/m.exec(LEDGER);
  if (!match) throw new Error('MIGRATIONS.md has no "## Last applied: N" heading');
  return Number(match[1]);
};

describe('migration file names', () => {
  it('never reuses a number', () => {
    const numbered = sqlFiles
      .map((name) => ({ name, number: numberOf(name) }))
      .filter((entry): entry is { name: string; number: number } => entry.number !== null);

    const seen = new Map<number, string>();
    const collisions = numbered.flatMap(({ name, number }) => {
      const previous = seen.get(number);
      seen.set(number, name);
      return previous ? [`${String(number).padStart(3, '0')}: ${previous} and ${name}`] : [];
    });

    // This is the failure two concurrent sessions produce, and the only one that reaches
    // the database as "which of these two did I already run?".
    expect(collisions).toEqual([]);
  });

  it('only allows the pre-ledger files to go unnumbered', () => {
    const unnumbered = sqlFiles.filter((name) => numberOf(name) === null);
    expect(unnumbered.sort()).toEqual([...LEGACY_FILES].sort());
  });
});

describe('ledger', () => {
  it('never lists a number twice', () => {
    // Uniqueness, deliberately NOT contiguity. A migration that gets written and then
    // abandoned leaves its number burned, and that is harmless: the next author still
    // reads `Last applied` and takes the one after it, so nothing is reused. Failing
    // the build on a gap would make the obvious fix "invent a filler migration", which
    // is worse than the gap it papers over. Reuse is the damage; this is what catches it.
    const rows = ledgerRowNumbers();
    expect(rows.length).toBeGreaterThan(0);
    expect([...new Set(rows)]).toEqual(rows);
  });

  it('declares Last applied as the highest row', () => {
    const rows = ledgerRowNumbers();
    expect(lastApplied()).toBe(Math.max(...rows));
  });

  it('has exactly one row per migration file', () => {
    // Both directions are errors HERE because every migration in this repo is committed
    // and kept: a file nobody recorded, and a row whose file was deleted. practice-hub
    // runs the same ledger and cannot assert this — their pre-091 migrations were never
    // committed, so 58 rows against 25 files is their normal state. Do not copy this
    // assertion to a repo where the ledger outlives the files it describes.
    expect(ledgerRowNumbers().length).toBe(sqlFiles.length);
  });

  it('records every numbered file', () => {
    const rows = new Set(ledgerRowNumbers());
    const missing = sqlFiles
      .map((name) => ({ name, number: numberOf(name) }))
      .filter((entry) => entry.number !== null && !rows.has(entry.number))
      .map((entry) => entry.name);

    expect(missing).toEqual([]);
  });

  it('names each legacy file in the row that describes it', () => {
    // The legacy rows are the only record tying an unnumbered file to its number.
    LEGACY_FILES.forEach((name) => {
      expect(LEDGER).toContain(name);
    });
  });
});
