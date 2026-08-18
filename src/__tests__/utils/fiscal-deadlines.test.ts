/**
 * Unit tests for AEAT fiscal deadline computation.
 * Tests computeDeadlines() and getActiveDeadlines() with various dates and filing states.
 */

import { FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import { computeDeadlines, getActiveDeadlines, getCarryOverDeadlines } from '@/utils/fiscalDeadlines';

describe('computeDeadlines', () => {
  describe('structure', () => {
    it('should return 10 deadlines for a year (4×303 + 4×130 + 390 + 100)', () => {
      const deadlines = computeDeadlines(2025, new Set());

      expect(deadlines).toHaveLength(10);
    });

    it('should include all four modelo types', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const types = new Set(deadlines.map((d) => d.modeloType));

      expect(types).toEqual(new Set([MODELO_TYPE.M303, MODELO_TYPE.M130, MODELO_TYPE.M390, MODELO_TYPE.M100]));
    });

    it('should have quarterly deadlines with fiscalQuarter and annual deadlines without', () => {
      const deadlines = computeDeadlines(2025, new Set());

      const quarterly = deadlines.filter((d) => d.fiscalQuarter !== null);
      const annual = deadlines.filter((d) => d.fiscalQuarter === null);

      expect(quarterly).toHaveLength(8); // 4 × 303 + 4 × 130
      expect(annual).toHaveLength(2); // 390 + 100
    });
  });

  describe('AEAT deadline dates', () => {
    it('should set Q1 303/130 deadline to April 1-20', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.startDate).toBe('2025-04-01');
      // 20 April 2025 was a Sunday, and AEAT published the deadline as 21 April
      expect(q1_303?.nominalEndDate).toBe('2025-04-20');
      expect(q1_303?.endDate).toBe('2025-04-21');
      // The direct-debit cut-off keeps its rule date rather than riding the extension
      expect(q1_303?.domiciliacionEndDate).toBe('2025-04-15');
    });

    it('should set Q2 303/130 deadline to July 1-20', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const q2_130 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M130 && d.fiscalQuarter === 2);

      expect(q2_130?.startDate).toBe('2025-07-01');
      // 20 July 2025 was a Sunday too: AEAT published 21 July
      expect(q2_130?.nominalEndDate).toBe('2025-07-20');
      expect(q2_130?.endDate).toBe('2025-07-21');
    });

    it('gives the direct-debit cut-off five days before each quarterly deadline', () => {
      // AEAT's own calendar: 1-15 April/July/October, and 1-27 January for the fourth quarter
      const deadlines = computeDeadlines(2026, new Set());
      const q3 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 3);
      const q4 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M130 && d.fiscalQuarter === 4);

      expect(q3?.domiciliacionEndDate).toBe('2026-10-15');
      expect(q4?.domiciliacionEndDate).toBe('2027-01-27');
    });

    it('moves the 4T 2026 deadline off its Saturday, which is when the refund is claimed', () => {
      const deadlines = computeDeadlines(2026, new Set());
      const q4 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 4);

      // 30 January 2027 is a Saturday: the real deadline is Monday 1 February
      expect(q4?.nominalEndDate).toBe('2027-01-30');
      expect(q4?.endDate).toBe('2027-02-01');
    });

    it('leaves no direct-debit date on the models that do not admit it', () => {
      const deadlines = computeDeadlines(2026, new Set());
      const renta = deadlines.find((d) => d.modeloType === MODELO_TYPE.M100);

      expect(renta?.domiciliacionEndDate).toBeNull();
    });

    it('flags a Renta campaign whose window has not been published yet', () => {
      // The window is set by an Orden every year and has moved: 2 April in 2025, 8 in 2026
      const published = computeDeadlines(2025, new Set()).find((d) => d.modeloType === MODELO_TYPE.M100);
      const unpublished = computeDeadlines(2030, new Set()).find((d) => d.modeloType === MODELO_TYPE.M100);

      expect(published?.isWindowConfirmed).toBe(true);
      expect(published?.startDate).toBe('2026-04-08');
      expect(unpublished?.isWindowConfirmed).toBe(false);
    });

    it('should set Q3 303/130 deadline to October 1-20', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const q3_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 3);

      expect(q3_303?.startDate).toBe('2025-10-01');
      expect(q3_303?.endDate).toBe('2025-10-20');
    });

    it('should set Q4 303/130 deadline to January 1-30 of next year', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const q4_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 4);

      expect(q4_303?.startDate).toBe('2026-01-01');
      expect(q4_303?.endDate).toBe('2026-01-30');
    });

    it('should set Modelo 390 deadline to January 1-30 of next year', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const m390 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M390);

      expect(m390?.startDate).toBe('2026-01-01');
      expect(m390?.endDate).toBe('2026-01-30');
      expect(m390?.fiscalQuarter).toBeNull();
    });

    it('should set Modelo 100 deadline to April 8 - June 30 of next year', () => {
      const deadlines = computeDeadlines(2025, new Set());
      const m100 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M100);

      expect(m100?.startDate).toBe('2026-04-08');
      expect(m100?.endDate).toBe('2026-06-30');
      expect(m100?.fiscalQuarter).toBeNull();
    });
  });

  describe('filing status computation', () => {
    it('should mark as NOT_DUE when well before the deadline window', () => {
      const now = new Date(2025, 0, 15); // January 15 — Q1 deadline is April
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.status).toBe(FILING_STATUS.NOT_DUE);
    });

    it('should mark as UPCOMING when within reminder window', () => {
      const now = new Date(2025, 2, 28); // March 28 — 4 days before April 1
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.status).toBe(FILING_STATUS.UPCOMING);
    });

    it('should mark as DUE when within the filing window', () => {
      const now = new Date(2025, 3, 10); // April 10 — within April 1-20
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.status).toBe(FILING_STATUS.DUE);
    });

    it('should mark as OVERDUE when past the deadline', () => {
      const now = new Date(2025, 3, 25); // April 25 — past April 20
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.status).toBe(FILING_STATUS.OVERDUE);
    });

    it('should mark as FILED when in the filed set', () => {
      const filedSet = new Set(['303-2025-1']);
      const now = new Date(2025, 3, 25); // Past deadline, but filed
      const deadlines = computeDeadlines(2025, filedSet, 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.status).toBe(FILING_STATUS.FILED);
      expect(q1_303?.isFiled).toBe(true);
    });

    it('should mark annual modelo as FILED with correct key format', () => {
      const filedSet = new Set(['390-2025']);
      const now = new Date(2026, 1, 15); // Past January 30 deadline
      const deadlines = computeDeadlines(2025, filedSet, 7, now);
      const m390 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M390);

      expect(m390?.status).toBe(FILING_STATUS.FILED);
    });
  });

  describe('daysRemaining', () => {
    it('should compute days remaining when before deadline', () => {
      const now = new Date(2025, 3, 15); // April 15 — 6 days before the extended 21 April deadline
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.daysRemaining).toBe(6);
    });

    it('should return null when past the deadline', () => {
      const now = new Date(2025, 3, 25); // April 25 — past April 20
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.daysRemaining).toBeNull();
    });
  });

  describe('needsPostponement', () => {
    it('should be true when within the filing window and not filed', () => {
      const now = new Date(2025, 3, 10); // April 10 — within April 1-20
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.needsPostponement).toBe(true);
    });

    it('should be false when before the filing window', () => {
      const now = new Date(2025, 2, 15); // March 15 — before April 1
      const deadlines = computeDeadlines(2025, new Set(), 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.needsPostponement).toBe(false);
    });

    it('should be false when filed even if within window', () => {
      const filedSet = new Set(['303-2025-1']);
      const now = new Date(2025, 3, 10); // April 10
      const deadlines = computeDeadlines(2025, filedSet, 7, now);
      const q1_303 = deadlines.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_303?.needsPostponement).toBe(false);
    });
  });

  describe('reminderDaysBefore parameter', () => {
    it('should use custom reminder window', () => {
      const now = new Date(2025, 2, 15); // March 15 — 17 days before April 1
      const deadlines30 = computeDeadlines(2025, new Set(), 30, now);
      const deadlines7 = computeDeadlines(2025, new Set(), 7, now);

      const q1_30 = deadlines30.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);
      const q1_7 = deadlines7.find((d) => d.modeloType === MODELO_TYPE.M303 && d.fiscalQuarter === 1);

      expect(q1_30?.status).toBe(FILING_STATUS.UPCOMING);
      expect(q1_7?.status).toBe(FILING_STATUS.NOT_DUE);
    });
  });
});

describe('getActiveDeadlines', () => {
  it('should filter out NOT_DUE and FILED deadlines', () => {
    const now = new Date(2025, 3, 10); // April 10
    const filedSet = new Set(['130-2025-1']); // 130 Q1 filed
    const deadlines = computeDeadlines(2025, filedSet, 7, now);
    const active = getActiveDeadlines(deadlines);

    // 303 Q1 should be DUE (within window, not filed)
    // 130 Q1 should be FILED (filtered out)
    // All Q2+ should be NOT_DUE (filtered out)
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((d) => d.status !== FILING_STATUS.NOT_DUE)).toBe(true);
    expect(active.every((d) => d.status !== FILING_STATUS.FILED)).toBe(true);
  });

  it('should return empty array when all are filed or not due', () => {
    const filedSet = new Set([
      '303-2025-1',
      '303-2025-2',
      '303-2025-3',
      '303-2025-4',
      '130-2025-1',
      '130-2025-2',
      '130-2025-3',
      '130-2025-4',
      '390-2025',
      '100-2025',
    ]);
    const now = new Date(2025, 0, 15); // January 15 — nothing upcoming
    const deadlines = computeDeadlines(2025, filedSet, 7, now);
    const active = getActiveDeadlines(deadlines);

    expect(active).toHaveLength(0);
  });
});

describe('getCarryOverDeadlines', () => {
  it('keeps the Q4 and 390 filings that fall due in January, after their year has closed', () => {
    // 10 January 2027 is inside the window of fiscal year 2026: the calendar year has changed but
    // the year being filed has not.
    const now = new Date(2027, 0, 10);
    const carryOver = getCarryOverDeadlines(computeDeadlines(2026, new Set(), 7, now));

    expect(carryOver.map((d) => `${d.modeloType}-${d.fiscalQuarter}`).sort()).toEqual(['130-4', '303-4', '390-null']);
    expect(carryOver.every((d) => d.fiscalYear === 2026)).toBe(true);
  });

  it('keeps the Renta of the closed year while its campaign runs', () => {
    const now = new Date(2027, 4, 1); // 1 May 2027 — inside the campaign of fiscal year 2026
    const carryOver = getCarryOverDeadlines(computeDeadlines(2026, new Set(), 7, now));

    expect(carryOver.map((d) => d.modeloType)).toEqual([MODELO_TYPE.M100]);
  });

  it('drops the overdue ones, which are a different conversation', () => {
    // Nothing filed all year, and every window of 2025 is shut. Carrying these over would park a
    // permanent warning on the dashboard instead of pointing at what is running out now.
    const now = new Date(2026, 7, 18);
    const carryOver = getCarryOverDeadlines(computeDeadlines(2025, new Set(), 7, now));

    expect(carryOver).toHaveLength(0);
  });

  it('drops what was already filed, so a diligent year carries nothing over', () => {
    const now = new Date(2027, 0, 10);
    const filedSet = new Set(['303-2026-4', '130-2026-4', '390-2026']);
    const carryOver = getCarryOverDeadlines(computeDeadlines(2026, filedSet, 7, now));

    expect(carryOver).toHaveLength(0);
  });
});
