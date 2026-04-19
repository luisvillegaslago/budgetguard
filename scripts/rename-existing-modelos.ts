/**
 * Rename FileName in DB for existing 'modelo' fiscal documents.
 * Recomputes the canonical name using buildModeloFileName() and updates
 * only rows where the name actually changes.
 *
 * Does NOT touch Vercel Blob (BlobPathname keeps its original slug + random suffix,
 * which is invisible to the user). The download proxy serves Content-Disposition
 * from the DB FileName, so downloads will use the new name immediately.
 *
 * Usage:
 *   DATABASE_URL=xxx npx tsx scripts/rename-existing-modelos.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Preview changes without writing to the database
 */

import { Pool } from 'pg';
import { MODELO_TYPE } from '../src/constants/finance';
import { buildModeloFileName } from '../src/utils/fiscalFileParser';
import type { ModeloType } from '../src/constants/finance';

interface ModeloRow {
  DocumentID: number;
  UserID: string;
  ModeloType: string | null;
  FiscalQuarter: number | null;
  FiscalYear: number | null;
  FileName: string;
}

interface RenameResult {
  documentId: number;
  userId: string;
  oldName: string;
  newName: string;
}

const VALID_MODELO_TYPES = new Set<string>([
  MODELO_TYPE.M303,
  MODELO_TYPE.M130,
  MODELO_TYPE.M390,
  MODELO_TYPE.M100,
]);

function isValidModeloType(value: string | null): value is ModeloType {
  return value !== null && VALID_MODELO_TYPES.has(value);
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const skipIdsFlag = process.argv.find((arg) => arg.startsWith('--skip-ids='));
  const skipIds = new Set<number>(
    skipIdsFlag
      ? skipIdsFlag
          .split('=')[1]
          ?.split(',')
          .map((id) => Number.parseInt(id.trim(), 10))
          .filter((n) => !Number.isNaN(n)) ?? []
      : [],
  );

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query<ModeloRow>(
      `SELECT "DocumentID", "UserID", "ModeloType", "FiscalQuarter", "FiscalYear", "FileName"
       FROM "FiscalDocuments"
       WHERE "DocumentType" = 'modelo'
       ORDER BY "FiscalYear" DESC, "ModeloType", "FiscalQuarter"`,
    );

    console.log(`Found ${rows.length} modelo document(s)`);
    if (isDryRun) console.log('DRY RUN — no changes will be written\n');

    // Compute which rows need renaming (excluding explicitly skipped IDs)
    const toRename: RenameResult[] = rows
      .filter((row) => {
        if (skipIds.has(row.DocumentID)) return false;
        if (!isValidModeloType(row.ModeloType)) return false;
        const newName = buildModeloFileName(row.ModeloType, row.FiscalQuarter, row.FiscalYear, row.FileName);
        return newName !== row.FileName;
      })
      .map((row) => ({
        documentId: row.DocumentID,
        userId: row.UserID,
        oldName: row.FileName,
        newName: buildModeloFileName(
          row.ModeloType as ModeloType,
          row.FiscalQuarter,
          row.FiscalYear,
          row.FileName,
        ),
      }));

    const skipped = skipIds.size > 0 ? [...skipIds].filter((id) => rows.some((r) => r.DocumentID === id)).length : 0;
    const unchanged = rows.length - toRename.length - skipped;

    if (toRename.length === 0) {
      console.log('All modelo documents already have canonical names. Nothing to do.');
      return;
    }

    const skipNote = skipped > 0 ? `   Skipped: ${skipped}` : '';
    console.log(`Will rename: ${toRename.length}   Already canonical: ${unchanged}${skipNote}\n`);

    toRename.forEach(({ documentId, oldName, newName }) => {
      const arrow = isDryRun ? '→ (would rename)' : '→';
      console.log(`  [ID ${documentId}] "${oldName}"  ${arrow}  "${newName}"`);
    });

    if (isDryRun) {
      console.log('\n(DRY RUN — rerun without --dry-run to apply changes)');
      return;
    }

    // Apply updates one by one so each ID is logged on failure
    let updated = 0;
    let errors = 0;

    await toRename.reduce(
      (chain, { documentId, newName, oldName }) =>
        chain.then(async () => {
          try {
            await pool.query('UPDATE "FiscalDocuments" SET "FileName" = $1 WHERE "DocumentID" = $2', [
              newName,
              documentId,
            ]);
            updated++;
          } catch (err) {
            console.error(
              `  ERROR updating ID ${documentId} ("${oldName}"): ${err instanceof Error ? err.message : String(err)}`,
            );
            errors++;
          }
        }),
      Promise.resolve(),
    );

    console.log('\n========================================');
    console.log('Summary:');
    console.log(`  Total modelos:     ${rows.length}`);
    console.log(`  Already canonical: ${unchanged}`);
    if (skipped > 0) console.log(`  Skipped:           ${skipped}`);
    console.log(`  Renamed:           ${updated}`);
    if (errors > 0) console.log(`  Errors:            ${errors}`);
    console.log('========================================');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
