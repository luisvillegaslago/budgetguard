/**
 * Unit Tests: the cross-quarter finding as a qualifier on a deadline that already exists
 *
 * The findings are computed elsewhere (getCrossQuarterInvoices). What is pinned here is the part
 * that decides WHERE they are allowed to appear, and it is defined by what it refuses to do:
 *
 *   - It invents no deadline. computeDeadlines() stays the only source of what is owed and when,
 *     so the list that comes out has exactly the entries that went in, in the same order.
 *   - It qualifies only a 303 or a 130. The 390 and the 100 span every quarter, so a quarter
 *     boundary moves nothing for them.
 *   - It qualifies only a filing the user is about to make — upcoming or due. An overdue filing is
 *     deliberately excluded: the moment to think about which quarter an invoice belongs to is
 *     before the figure is copied, and a filed one has already been copied.
 *   - It says nothing when there is nothing to say, so the note keeps its meaning when it appears.
 */

import type { CrossQuarterCase, FilingStatus, ModeloType } from '@/constants/finance';
import {
  CROSS_QUARTER_CASE,
  CROSS_QUARTER_DEADLINE_FILING_STATUSES,
  CROSS_QUARTER_DEADLINE_MODELOS,
  FILING_STATUS,
  MODELO_TYPE,
} from '@/constants/finance';
import type { CrossQuarterInvoice, FiscalDeadline } from '@/types/finance';
import {
  acceptsCrossQuarterNote,
  buildCrossQuarterNote,
  getCrossQuarterNoteQuarters,
  withCrossQuarterNotes,
} from '@/utils/crossQuarterDeadlineNotes';

const YEAR = 2026;

function deadline(modeloType: ModeloType, fiscalQuarter: number | null, status: FilingStatus): FiscalDeadline {
  return {
    modeloType,
    fiscalYear: YEAR,
    fiscalQuarter,
    startDate: '2026-10-01',
    endDate: '2026-10-20',
    nominalEndDate: '2026-10-20',
    domiciliacionEndDate: '2026-10-15',
    isWindowConfirmed: true,
    status,
    isFiled: status === FILING_STATUS.FILED,
    daysRemaining: 5,
    needsPostponement: false,
  };
}

function invoice(crossQuarterCase: CrossQuarterCase, totalCents: number): CrossQuarterInvoice {
  return {
    invoiceId: 1,
    invoiceNumber: 'DW-09',
    clientName: 'Acme',
    totalCents,
    invoiceDate: '2026-08-03',
    invoiceYear: YEAR,
    invoiceQuarter: 3,
    collectionDate: null,
    collectionYear: null,
    collectionQuarter: null,
    crossQuarterCase,
    crossesFiscalYear: false,
  };
}

describe('acceptsCrossQuarterNote — which filings a finding may qualify', () => {
  it('accepts the quarterly modelos the constant names, on an imminent filing', () => {
    CROSS_QUARTER_DEADLINE_MODELOS.forEach((modeloType) => {
      CROSS_QUARTER_DEADLINE_FILING_STATUSES.forEach((status) => {
        expect(acceptsCrossQuarterNote(deadline(modeloType, 3, status))).toBe(true);
      });
    });
  });

  it('refuses the annual modelos, which no quarter boundary can move', () => {
    // The 390 and the 100 declare the whole year: an invoice crossing from 2T into 3T lands in
    // the same annual figure either way, so a note there would be noise with no consequence.
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M390, null, FILING_STATUS.DUE))).toBe(false);
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M100, null, FILING_STATUS.DUE))).toBe(false);
  });

  it('refuses a filing that is not imminent, overdue included', () => {
    // OVERDUE is the deliberate exclusion: the qualifier exists to be read before the figure is
    // copied into the modelo, and by then it is either filed or late for a different reason.
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M303, 3, FILING_STATUS.OVERDUE))).toBe(false);
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M303, 3, FILING_STATUS.FILED))).toBe(false);
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M303, 3, FILING_STATUS.NOT_DUE))).toBe(false);
  });

  it('refuses an entry that names no quarter, whatever its modelo', () => {
    expect(acceptsCrossQuarterNote(deadline(MODELO_TYPE.M303, null, FILING_STATUS.DUE))).toBe(false);
  });
});

describe('getCrossQuarterNoteQuarters — what is worth a round trip', () => {
  it('asks once per quarter even when both modelos of it are due', () => {
    const quarters = getCrossQuarterNoteQuarters([
      deadline(MODELO_TYPE.M303, 3, FILING_STATUS.DUE),
      deadline(MODELO_TYPE.M130, 3, FILING_STATUS.DUE),
    ]);

    expect(quarters).toEqual([3]);
  });

  it('returns them ascending, so a year with two imminent quarters reads in order', () => {
    const quarters = getCrossQuarterNoteQuarters([
      deadline(MODELO_TYPE.M130, 4, FILING_STATUS.UPCOMING),
      deadline(MODELO_TYPE.M303, 2, FILING_STATUS.DUE),
    ]);

    expect(quarters).toEqual([2, 4]);
  });

  it('costs nothing at all when nothing is about to be filed', () => {
    // The route maps over this list, so an empty one is literally zero queries — the reason the
    // qualifier can ride a surface the dashboard renders on every load.
    const quarters = getCrossQuarterNoteQuarters([
      deadline(MODELO_TYPE.M303, 1, FILING_STATUS.FILED),
      deadline(MODELO_TYPE.M303, 4, FILING_STATUS.NOT_DUE),
      deadline(MODELO_TYPE.M100, null, FILING_STATUS.DUE),
    ]);

    expect(quarters).toEqual([]);
  });
});

describe('buildCrossQuarterNote — what the note says', () => {
  it('counts every case and totals what the user might be tempted to move', () => {
    const note = buildCrossQuarterNote(YEAR, 3, [
      invoice(CROSS_QUARTER_CASE.COLLECTED_IN_ANOTHER_PERIOD, 120000),
      invoice(CROSS_QUARTER_CASE.DECLARED_IN_EARLIER_PERIOD, 45050),
    ]);

    expect(note).toEqual({
      fiscalYear: YEAR,
      fiscalQuarter: 3,
      invoiceCount: 2,
      totalCents: 165050,
      dataIntegrityCount: 0,
    });
  });

  it('counts the lost links apart, because they need their own sentence', () => {
    const note = buildCrossQuarterNote(YEAR, 1, [
      invoice(CROSS_QUARTER_CASE.PAID_WITHOUT_LINKED_MOVEMENT, 100000),
      invoice(CROSS_QUARTER_CASE.ISSUED_NOT_COLLECTED, 20000),
    ]);

    // Still two findings — the broken record is one of them — but only one is a repair job, and
    // the copy has to be able to say so without implying the figures are wrong.
    expect(note?.invoiceCount).toBe(2);
    expect(note?.dataIntegrityCount).toBe(1);
  });

  it('says nothing rather than showing a zero', () => {
    // A qualifier that is always on screen is a qualifier the user stops seeing, and the usual
    // quarter is the one where devengo and cobro agree.
    expect(buildCrossQuarterNote(YEAR, 2, [])).toBeNull();
  });
});

describe('withCrossQuarterNotes — riding the deadline, never replacing it', () => {
  const deadlines = [
    deadline(MODELO_TYPE.M303, 3, FILING_STATUS.DUE),
    deadline(MODELO_TYPE.M130, 3, FILING_STATUS.DUE),
    deadline(MODELO_TYPE.M303, 4, FILING_STATUS.NOT_DUE),
    deadline(MODELO_TYPE.M390, null, FILING_STATUS.DUE),
  ];
  const note = { fiscalYear: YEAR, fiscalQuarter: 3, invoiceCount: 2, totalCents: 165050, dataIntegrityCount: 1 };

  it('invents no deadline: the same entries come back, in the same order', () => {
    const annotated = withCrossQuarterNotes(deadlines, [note]);

    expect(annotated).toHaveLength(deadlines.length);
    expect(annotated.map((entry) => `${entry.modeloType}-${entry.fiscalQuarter}`)).toEqual([
      '303-3',
      '130-3',
      '303-4',
      '390-null',
    ]);
  });

  it('attaches the note to both imminent filings of its quarter and to nothing else', () => {
    const annotated = withCrossQuarterNotes(deadlines, [note]);

    expect(annotated[0]?.crossQuarter).toEqual(note);
    expect(annotated[1]?.crossQuarter).toEqual(note);
    expect(annotated[2]?.crossQuarter).toBeUndefined();
    expect(annotated[3]?.crossQuarter).toBeUndefined();
  });

  it('leaves the field absent rather than null when a quarter has no findings', () => {
    // Absent and null would have to be told apart downstream — "no findings" from "not looked
    // up" — and the component only ever asks whether there is something to render.
    const annotated = withCrossQuarterNotes(deadlines, []);

    expect(annotated).toEqual(deadlines);
    expect(annotated.every((entry) => !('crossQuarter' in entry))).toBe(true);
  });

  it('never carries a note across fiscal years', () => {
    const otherYear = { ...note, fiscalYear: YEAR - 1 };

    const annotated = withCrossQuarterNotes(deadlines, [otherYear]);

    expect(annotated.every((entry) => entry.crossQuarter === undefined)).toBe(true);
  });

  it('changes nothing else on a deadline it annotates', () => {
    const [annotated] = withCrossQuarterNotes(deadlines, [note]);
    const { crossQuarter, ...rest } = annotated ?? {};

    expect(crossQuarter).toEqual(note);
    expect(rest).toEqual(deadlines[0]);
  });
});
