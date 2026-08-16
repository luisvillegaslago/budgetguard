/**
 * Integration Tests: Annual Fiscal Profile Repository
 *
 * The profile is the only place the pension contributions live: they are savings, so no
 * transaction can carry them, and they exist once per user and fiscal year. Three things
 * therefore have to hold at this layer, and none of them can be seen from the route:
 *
 *  1. A year that was never filled in must read as zeroed, not as missing — the card's form
 *     always needs something to seed itself with, and the projection always needs a figure.
 *  2. The write is an upsert: saving twice for the same year corrects the row instead of
 *     creating a second one, because the (UserID, FiscalYear) unique constraint says so.
 *  3. Every read and write is scoped to the current user. A profile is a tax figure; leaking
 *     one across users would silently change somebody else's IRPF estimate.
 *
 * Postgres is faked with a Map keyed by (UserID, FiscalYear), which is the constraint the real
 * ON CONFLICT relies on, so the upsert is exercised as behaviour and not as a string match.
 */

import type { FiscalProfileInput } from '@/types/finance';

// ── Fake Postgres ──

interface StoredRow {
  UserID: number;
  FiscalYear: number;
  PensionIndividualCents: number;
  PensionEmploymentCents: number;
  VatPoolOpeningCents: number;
}

/** One row per (UserID, FiscalYear), exactly like "UQ_FiscalProfiles_UserYear". */
const stored = new Map<string, StoredRow>();

const executed: Array<{ sql: string; params: unknown[] }> = [];

function keyOf(userId: number, year: number): string {
  return `${userId}:${year}`;
}

function toReturnedRow(row: StoredRow) {
  return {
    FiscalYear: row.FiscalYear,
    PensionIndividualCents: row.PensionIndividualCents,
    PensionEmploymentCents: row.PensionEmploymentCents,
    VatPoolOpeningCents: row.VatPoolOpeningCents,
  };
}

/** What COALESCE($n, "column") does: a null parameter leaves the stored value alone. */
const coalesce = (incoming: number | null, storedValue: number | undefined): number => incoming ?? storedValue ?? 0;

const mockQuery = jest.fn(async (sql: string, params: unknown[]) => {
  executed.push({ sql, params });

  if (sql.includes('INSERT INTO "FiscalProfiles"')) {
    const [userId, year, individualCents, employmentCents, vatPoolCents] = params as [
      number,
      number,
      number | null,
      number | null,
      number | null,
    ];
    // ON CONFLICT ("UserID", "FiscalYear") DO UPDATE with COALESCE: the fields the caller sent
    // are overwritten, the ones it omitted keep whatever the row already held.
    const previous = stored.get(keyOf(userId, year));
    const row: StoredRow = {
      UserID: userId,
      FiscalYear: year,
      PensionIndividualCents: coalesce(individualCents, previous?.PensionIndividualCents),
      PensionEmploymentCents: coalesce(employmentCents, previous?.PensionEmploymentCents),
      VatPoolOpeningCents: coalesce(vatPoolCents, previous?.VatPoolOpeningCents),
    };
    stored.set(keyOf(userId, year), row);
    return [toReturnedRow(row)];
  }

  const [userId, year] = params as [number, number];
  const row = stored.get(keyOf(userId, year));
  return row ? [toReturnedRow(row)] : [];
});

jest.mock('@/services/database/connection', () => ({
  query: (...args: [string, unknown[]]) => mockQuery(...args),
}));

/** The signed-in user, swapped by the scoping tests. */
let currentUserId = 2;

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => currentUserId),
}));

import {
  getFiscalProfile,
  getFiscalProfileForUser,
  upsertFiscalProfile,
} from '@/services/database/FiscalProfileRepository';

// ── Fixtures ──

const YEAR = 2026;
const OTHER_USER_ID = 7;

/** The user's real 2025 contributions: 1.500 € individual + 4.250 € plan de empleo. */
const MAXED_OUT: FiscalProfileInput = { pensionIndividualCents: 150_000, pensionEmploymentCents: 425_000 };

// ── Tests ──

describe('FiscalProfileRepository', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    executed.length = 0;
    stored.clear();
    currentUserId = 2;
  });

  describe('reading a year that was never saved', () => {
    it('returns a zeroed profile instead of null', async () => {
      const profile = await getFiscalProfile(YEAR);

      expect(profile).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 0,
        pensionEmploymentCents: 0,
        vatPoolOpeningCents: 0,
      });
    });

    it('echoes the requested year back, so the caller can key on it', async () => {
      expect((await getFiscalProfile(2025)).fiscalYear).toBe(2025);
      expect((await getFiscalProfile(2026)).fiscalYear).toBe(2026);
    });

    it('leaves nothing behind: reading a missing year never writes a row', async () => {
      await getFiscalProfile(YEAR);

      expect(executed.every(({ sql }) => !sql.includes('INSERT'))).toBe(true);
      expect(stored.size).toBe(0);
    });
  });

  describe('upsert', () => {
    it('creates the row the first time the year is saved', async () => {
      const profile = await upsertFiscalProfile(YEAR, MAXED_OUT);

      expect(profile).toEqual({ fiscalYear: YEAR, ...MAXED_OUT, vatPoolOpeningCents: 0 });
      expect(stored.size).toBe(1);
    });

    it('updates that same row the second time instead of duplicating the year', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);
      // The 2026 figures so far: 1.500 € individual + 1.000 € plan de empleo
      const corrected = await upsertFiscalProfile(YEAR, {
        pensionIndividualCents: 150_000,
        pensionEmploymentCents: 100_000,
      });

      expect(corrected.pensionEmploymentCents).toBe(100_000);
      expect(stored.size).toBe(1);
      expect(await getFiscalProfile(YEAR)).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 150_000,
        pensionEmploymentCents: 100_000,
        vatPoolOpeningCents: 0,
      });
    });

    it('resolves the conflict on the (UserID, FiscalYear) pair', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);

      const insert = executed.find(({ sql }) => sql.includes('INSERT INTO "FiscalProfiles"'));
      expect(insert?.sql).toContain('ON CONFLICT ("UserID", "FiscalYear")');
      expect(insert?.params).toEqual([2, YEAR, 150_000, 425_000, null]);
      // COALESCE, not EXCLUDED: an omitted field must survive the write
      expect(insert?.sql).toContain('COALESCE');
    });

    it('keeps each year on its own row', async () => {
      await upsertFiscalProfile(2025, MAXED_OUT);
      await upsertFiscalProfile(2026, { pensionIndividualCents: 150_000, pensionEmploymentCents: 100_000 });

      expect((await getFiscalProfile(2025)).pensionEmploymentCents).toBe(425_000);
      expect((await getFiscalProfile(2026)).pensionEmploymentCents).toBe(100_000);
    });

    it('stores a zeroed year, which is how a contribution is cleared', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);
      await upsertFiscalProfile(YEAR, { pensionIndividualCents: 0, pensionEmploymentCents: 0 });

      expect(await getFiscalProfile(YEAR)).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 0,
        pensionEmploymentCents: 0,
        vatPoolOpeningCents: 0,
      });
    });

    it('never leaks a saved year into a neighbouring one', async () => {
      await upsertFiscalProfile(2025, MAXED_OUT);

      // 2026 was never filled in: it reads zeroed, it does not inherit the 2025 contributions
      expect(await getFiscalProfile(2026)).toEqual({
        fiscalYear: 2026,
        pensionIndividualCents: 0,
        pensionEmploymentCents: 0,
        vatPoolOpeningCents: 0,
      });
    });

    it('keeps the fields the caller did not send', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);
      await upsertFiscalProfile(YEAR, { vatPoolOpeningCents: 114_452 });

      // Saving the IVA pool must not wipe the pension contributions of the same row
      expect(await getFiscalProfile(YEAR)).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 150_000,
        pensionEmploymentCents: 425_000,
        vatPoolOpeningCents: 114_452,
      });
    });

    it('overwrites both buckets instead of merging with what was stored', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);
      // The user moved everything into the plan de empleo and cleared the individual one
      await upsertFiscalProfile(YEAR, { pensionIndividualCents: 0, pensionEmploymentCents: 425_000 });

      // A merge would have kept the old 1.500 € and overstated the reduction
      expect(await getFiscalProfile(YEAR)).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 0,
        pensionEmploymentCents: 425_000,
        vatPoolOpeningCents: 0,
      });
    });

    it('stores what was actually paid in, even above the legal ceiling', async () => {
      // The cap belongs to the projection: the row records the fact, not its fiscal treatment
      const profile = await upsertFiscalProfile(YEAR, { pensionIndividualCents: 575_000, pensionEmploymentCents: 0 });

      expect(profile.pensionIndividualCents).toBe(575_000);
    });
  });

  describe('user scoping', () => {
    it('reads only the row of the signed-in user', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);

      currentUserId = OTHER_USER_ID;

      // Another taxpayer's year is untouched: zeroed, never the first user's contributions
      expect(await getFiscalProfile(YEAR)).toEqual({
        fiscalYear: YEAR,
        pensionIndividualCents: 0,
        pensionEmploymentCents: 0,
        vatPoolOpeningCents: 0,
      });
    });

    it('writes under the signed-in user, never over somebody else', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);

      currentUserId = OTHER_USER_ID;
      await upsertFiscalProfile(YEAR, { pensionIndividualCents: 100_000, pensionEmploymentCents: 0 });

      expect(stored.size).toBe(2);
      expect(stored.get(`2:${YEAR}`)?.PensionEmploymentCents).toBe(425_000);
      expect(stored.get(`${OTHER_USER_ID}:${YEAR}`)?.PensionEmploymentCents).toBe(0);
    });

    it('filters every read by UserID and FiscalYear', async () => {
      await getFiscalProfile(YEAR);

      const select = executed.find(({ sql }) => sql.includes('SELECT'));
      expect(select?.sql).toContain('WHERE "UserID" = $1 AND "FiscalYear" = $2');
      expect(select?.params).toEqual([2, YEAR]);
    });

    it('trusts the id the caller already resolved, without asking the session again', async () => {
      // getIrpfProjection() has the userId in hand: re-resolving it would be a second session read
      const { getUserIdOrThrow } = jest.requireMock('@/libs/auth');
      (getUserIdOrThrow as jest.Mock).mockClear();

      await upsertFiscalProfile(YEAR, MAXED_OUT);
      (getUserIdOrThrow as jest.Mock).mockClear();

      const profile = await getFiscalProfileForUser(2, YEAR);

      expect(profile).toEqual({ fiscalYear: YEAR, ...MAXED_OUT, vatPoolOpeningCents: 0 });
      expect(getUserIdOrThrow).not.toHaveBeenCalled();
    });

    it('scopes the explicit-id read to that user too', async () => {
      await upsertFiscalProfile(YEAR, MAXED_OUT);

      const profile = await getFiscalProfileForUser(OTHER_USER_ID, YEAR);

      expect(profile.pensionIndividualCents).toBe(0);
      expect(profile.pensionEmploymentCents).toBe(0);
    });
  });
});
