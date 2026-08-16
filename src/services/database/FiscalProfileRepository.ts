/**
 * BudgetGuard Fiscal Profile Repository
 * Read/upsert of the annual fiscal profile (1 row per user × fiscal year): the figures the
 * taxpayer sets once a year and that no transaction can carry — today, the pension plan
 * contributions that reduce the base imponible general of the Renta.
 *
 * All queries are user-scoped: through getUserIdOrThrow(), except getFiscalProfileForUser(),
 * which takes the id from a caller that already resolved it.
 */

import { getUserIdOrThrow } from '@/libs/auth';
import type { FiscalProfile, FiscalProfileInput } from '@/types/finance';
import { query } from './connection';

// ============================================================
// Row Types
// ============================================================

interface FiscalProfileRow {
  FiscalYear: number;
  PensionIndividualCents: number;
  PensionEmploymentCents: number;
}

/** Columns shared by the SELECT and the RETURNING of the upsert */
const PROFILE_COLUMNS = '"FiscalYear", "PensionIndividualCents", "PensionEmploymentCents"';

// ============================================================
// Transformers
// ============================================================

function rowToFiscalProfile(row: FiscalProfileRow): FiscalProfile {
  return {
    fiscalYear: row.FiscalYear,
    pensionIndividualCents: row.PensionIndividualCents,
    pensionEmploymentCents: row.PensionEmploymentCents,
  };
}

/** A year the user never filled in behaves as a year with nothing contributed. */
function emptyProfile(year: number): FiscalProfile {
  return { fiscalYear: year, pensionIndividualCents: 0, pensionEmploymentCents: 0 };
}

// ============================================================
// Queries
// ============================================================

/**
 * Annual fiscal profile of a given user.
 *
 * Takes the userId instead of resolving it: the caller is a fiscal model that already has it
 * (same contract as getFiledModeloAmounts).
 */
export async function getFiscalProfileForUser(userId: number, year: number): Promise<FiscalProfile> {
  const rows = await query<FiscalProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM "FiscalProfiles" WHERE "UserID" = $1 AND "FiscalYear" = $2`,
    [userId, year],
  );
  return rows[0] ? rowToFiscalProfile(rows[0]) : emptyProfile(year);
}

/** Annual fiscal profile of the current user (zeroed when the year was never saved). */
export async function getFiscalProfile(year: number): Promise<FiscalProfile> {
  return getFiscalProfileForUser(await getUserIdOrThrow(), year);
}

/**
 * Create or update the annual fiscal profile of the current user.
 * The (UserID, FiscalYear) unique constraint makes the upsert idempotent per year.
 */
export async function upsertFiscalProfile(year: number, input: FiscalProfileInput): Promise<FiscalProfile> {
  const userId = await getUserIdOrThrow();
  const rows = await query<FiscalProfileRow>(
    `INSERT INTO "FiscalProfiles" ("UserID", "FiscalYear", "PensionIndividualCents", "PensionEmploymentCents")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("UserID", "FiscalYear") DO UPDATE SET
       "PensionIndividualCents" = EXCLUDED."PensionIndividualCents",
       "PensionEmploymentCents" = EXCLUDED."PensionEmploymentCents"
     RETURNING ${PROFILE_COLUMNS}`,
    [userId, year, input.pensionIndividualCents, input.pensionEmploymentCents],
  );
  return rowToFiscalProfile(rows[0]!);
}
