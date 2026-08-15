/**
 * BudgetGuard Fiscal Repository
 * Database operations for fiscal reports (user-scoped):
 * - Modelo 303 (IVA trimestral)
 * - Modelo 130 (IRPF trimestral)
 * - Modelo 390 (IVA anual)
 * - Modelo 100 (IRPF anual — sección actividades económicas)
 *
 * Reads vw_FiscalAccrual for raw rows (invoice income booked on the invoice date) and
 * derives every figure with computeFiscalFields().
 * All calculations happen in TypeScript (not SQL) for consistent rounding with the frontend.
 */

import {
  DEFAULT_IRPF_REGION,
  FILING_STATUS,
  IRPF_PROJECTION,
  IRPF_RATE,
  ISSUED_INVOICE_STATUSES,
  MODELO_100_DEFAULT_CASILLA,
  MODELO_TYPE,
  PROFESSIONAL_INCOME_CATEGORY,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { getFiledModeloAmounts } from '@/services/database/FiscalDocumentRepository';
import type {
  FiscalTransaction,
  IrpfProjection,
  Modelo100Section,
  Modelo130Summary,
  Modelo303Summary,
  Modelo390Summary,
} from '@/types/finance';
import { calcGastosDificilCents, computeFiscalFields } from '@/utils/fiscal';
import { computeDeadlines } from '@/utils/fiscalDeadlines';
import { toDateString } from '@/utils/helpers';
import { computeIrpfCents, computeMarginalRate, getYearProgress, projectAnnualCents } from '@/utils/irpf';
import { query } from './connection';

interface FiscalViewRow {
  FiscalYear: number;
  FiscalQuarter: number;
  Type: string;
  TransactionID: number;
  CategoryID: number;
  CategoryName: string;
  ParentCategoryName: string;
  TransactionDate: Date;
  VendorName: string | null;
  InvoiceNumber: string | null;
  Description: string | null;
  FullAmountCents: number;
  VatPercent: number;
  DeductionPercent: number;
  /** IRPF withheld by the client. Non-zero only on issued-invoice rows. */
  RetentionCents: number;
  CompanyTaxId: string | null;
}

function rowToFiscalTransaction(row: FiscalViewRow): FiscalTransaction {
  const computed = computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent);

  return {
    transactionId: row.TransactionID,
    transactionDate: toDateString(row.TransactionDate),
    categoryName: row.CategoryName,
    parentCategoryName: row.ParentCategoryName,
    vendorName: row.VendorName,
    invoiceNumber: row.InvoiceNumber,
    companyTaxId: row.CompanyTaxId,
    description: row.Description,
    type: row.Type as FiscalTransaction['type'],
    fullAmountCents: row.FullAmountCents,
    vatPercent: row.VatPercent,
    deductionPercent: row.DeductionPercent,
    ...computed,
  };
}

const FISCAL_VIEW_COLUMNS = `v."FiscalYear", v."FiscalQuarter", v."Type", v."TransactionID", v."CategoryID",
           v."CategoryName", v."ParentCategoryName", v."TransactionDate",
           v."VendorName", v."InvoiceNumber", v."Description",
           v."FullAmountCents", v."VatPercent", v."DeductionPercent", v."RetentionCents",
           co."TaxId" AS "CompanyTaxId"`;

const FISCAL_FROM = `FROM "vw_FiscalAccrual" v
    LEFT JOIN "Transactions" t2 ON v."TransactionID" = t2."TransactionID"
    LEFT JOIN "Companies" co ON t2."CompanyID" = co."CompanyID"`;

const FISCAL_VIEW_COLUMNS_SIMPLE = `"FiscalYear", "FiscalQuarter", "Type", "TransactionID", "CategoryID",
           "CategoryName", "ParentCategoryName", "TransactionDate",
           "VendorName", "InvoiceNumber", "Description",
           "FullAmountCents", "VatPercent", "DeductionPercent", "RetentionCents"`;

function isProfessionalIncome(row: FiscalViewRow): boolean {
  return row.Type === TRANSACTION_TYPE.INCOME && row.ParentCategoryName === PROFESSIONAL_INCOME_CATEGORY;
}

/**
 * Get fiscal expenses for a specific quarter (user-scoped)
 */
export async function getFiscalExpenses(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    ${FISCAL_FROM}
    WHERE v."FiscalYear" = $1 AND v."FiscalQuarter" = $2
      AND v."Type" = $3 AND v."UserID" = $4
    ORDER BY v."TransactionDate" ASC`,
    [year, quarter, TRANSACTION_TYPE.EXPENSE, userId],
  );

  return rows.map(rowToFiscalTransaction);
}

/** Inlined rather than bound: these are internal constants, never user input. */
const ISSUED_INVOICE_STATUS_LIST = ISSUED_INVOICE_STATUSES.map((status) => `'${status}'`).join(', ');

const issuedInvoiceStatusFilter = (alias: string): string => `${alias}."Status" IN (${ISSUED_INVOICE_STATUS_LIST})`;

/** Matches the accrual view's EXTRACT(QUARTER FROM "InvoiceDate"). */
const invoiceQuarter = (alias: string): string => `EXTRACT(QUARTER FROM ${alias}."InvoiceDate")`;

/** How a model scopes the year: one quarter, everything up to it, or the whole year. */
type PeriodScope = { quarter: number; cumulative: boolean } | undefined;

function periodFilter(scope: PeriodScope, paramIndex: number): string {
  if (!scope) return '';
  return ` AND v."FiscalQuarter" ${scope.cumulative ? '<=' : '='} $${paramIndex}`;
}

/**
 * The single entry point every fiscal model reads from.
 *
 * "vw_FiscalAccrual" already books invoice income on the invoice date and drops the
 * payment transactions, so no model has to know about that rule. Reading
 * "vw_FiscalQuarterly" directly here would reintroduce cash-basis income.
 */
async function loadFiscalRows(userId: number, year: number, scope?: PeriodScope): Promise<FiscalViewRow[]> {
  const params: unknown[] = [year, userId];
  if (scope) params.push(scope.quarter);

  return query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS_SIMPLE}, NULL AS "CompanyTaxId"
     FROM "vw_FiscalAccrual" v
     WHERE v."FiscalYear" = $1 AND v."UserID" = $2${periodFilter(scope, params.length)}`,
    params,
  );
}

interface IssuedInvoiceRow {
  InvoiceID: number;
  InvoiceNumber: string;
  InvoiceDate: Date;
  BaseCents: number;
  VatPercent: number;
  VatCents: number;
  ClientName: string;
  ClientTaxId: string | null;
  LineItemsDescription: string | null;
}

function issuedInvoiceToFiscalTransaction(row: IssuedInvoiceRow): FiscalTransaction {
  const baseCents = Number(row.BaseCents);
  const ivaCents = Number(row.VatCents);

  return {
    transactionId: row.InvoiceID,
    transactionDate: toDateString(row.InvoiceDate),
    categoryName: PROFESSIONAL_INCOME_CATEGORY,
    parentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    vendorName: row.ClientName,
    invoiceNumber: row.InvoiceNumber,
    companyTaxId: row.ClientTaxId,
    description: row.LineItemsDescription,
    type: TRANSACTION_TYPE.INCOME,
    // The withholding is not part of the fiscal amount: it is IRPF already paid, not less income.
    fullAmountCents: baseCents + ivaCents,
    vatPercent: Number(row.VatPercent),
    deductionPercent: 0,
    baseCents,
    ivaCents,
    baseDeducibleCents: 0,
    ivaDeducibleCents: 0,
  };
}

/**
 * Get fiscal invoices for a specific quarter (user-scoped).
 * Queries the Invoices table directly for finalized/paid invoices,
 * so they appear as soon as they are issued (not only when paid).
 */
export async function getFiscalInvoices(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<IssuedInvoiceRow>(
    `SELECT i."InvoiceID", i."InvoiceNumber", i."InvoiceDate",
            i."BaseCents", i."VatPercent", i."VatCents",
            i."ClientName", i."ClientTaxId",
            STRING_AGG(li."Description", ', ' ORDER BY li."SortOrder") AS "LineItemsDescription"
     FROM "Invoices" i
     LEFT JOIN "InvoiceLineItems" li ON li."InvoiceID" = i."InvoiceID"
     WHERE i."UserID" = $1
       AND ${issuedInvoiceStatusFilter('i')}
       AND EXTRACT(YEAR FROM i."InvoiceDate") = $2
       AND ${invoiceQuarter('i')} = $3
     GROUP BY i."InvoiceID", i."InvoiceNumber", i."InvoiceDate",
              i."BaseCents", i."VatPercent", i."VatCents",
              i."ClientName", i."ClientTaxId"
     ORDER BY i."InvoiceDate" ASC`,
    [userId, year, quarter],
  );

  return rows.map(issuedInvoiceToFiscalTransaction);
}

/**
 * Compute Modelo 303 summary for a single quarter (user-scoped)
 */
export async function getModelo303Summary(year: number, quarter: number): Promise<Modelo303Summary> {
  const userId = await getUserIdOrThrow();

  const rows = await loadFiscalRows(userId, year, { quarter, cumulative: false });

  let casilla07 = 0;
  let casilla09 = 0;
  let casilla120 = 0;
  let casilla28 = 0;
  let casilla29 = 0;

  rows.forEach((row) => {
    const { baseCents, ivaCents, baseDeducibleCents, ivaDeducibleCents } = computeFiscalFields(
      row.FullAmountCents,
      row.VatPercent,
      row.DeductionPercent,
    );

    if (isProfessionalIncome(row)) {
      if (row.VatPercent > 0) {
        casilla07 += baseCents;
        casilla09 += ivaCents;
      } else {
        casilla120 += baseCents;
      }
    } else if (row.Type === TRANSACTION_TYPE.EXPENSE && row.VatPercent > 0) {
      casilla28 += baseDeducibleCents;
      casilla29 += ivaDeducibleCents;
    }
  });

  const casilla27 = casilla09;
  const casilla45 = casilla29;
  const resultCents = casilla27 - casilla45;

  return {
    fiscalYear: year,
    fiscalQuarter: quarter,
    casilla07Cents: casilla07,
    casilla09Cents: casilla09,
    casilla27Cents: casilla27,
    casilla28Cents: casilla28,
    casilla29Cents: casilla29,
    casilla45Cents: casilla45,
    casilla120Cents: casilla120,
    resultCents,
  };
}

interface Modelo130Accumulator {
  ingresosAcum: number;
  gastosDocAcum: number;
  retencionesAcum: number;
  pagosAnteriores: number;
  /** True once a previous quarter had to be guessed because no filed amount was recorded */
  anyQuarterEstimated: boolean;
}

/** Filed casilla 07 per quarter, from the modelos already presented (see FiscalDocumentRepository) */
type FiledModeloAmounts = Map<number, number>;

/**
 * What a quarter contributed to casilla 05: the amount actually filed when it is known,
 * the recomputation otherwise. Only positive results settled anything — the form says
 * "suma de los importes POSITIVOS de la casilla 07", so a negative quarter adds nothing.
 */
function settledAmountCents(quarter: number, computedCents: number, filedAmounts: FiledModeloAmounts): number {
  return Math.max(0, filedAmounts.get(quarter) ?? computedCents);
}

interface QuarterTotals {
  ingresos: number;
  gastosDoc: number;
  retenciones: number;
}

/** Income, documented expenses and withholdings of a single quarter. */
function quarterTotals(rows: FiscalViewRow[], quarter: number): QuarterTotals {
  return rows
    .filter((row) => row.FiscalQuarter === quarter)
    .reduce<QuarterTotals>(
      (totals, row) => {
        const { baseCents, baseDeducibleCents } = computeFiscalFields(
          row.FullAmountCents,
          row.VatPercent,
          row.DeductionPercent,
        );

        if (isProfessionalIncome(row)) {
          return {
            ingresos: totals.ingresos + baseCents,
            gastosDoc: totals.gastosDoc,
            retenciones: totals.retenciones + row.RetentionCents,
          };
        }
        if (row.Type === TRANSACTION_TYPE.EXPENSE) {
          return {
            ingresos: totals.ingresos,
            gastosDoc: totals.gastosDoc + baseDeducibleCents,
            retenciones: totals.retenciones,
          };
        }
        return totals;
      },
      { ingresos: 0, gastosDoc: 0, retenciones: 0 },
    );
}

/**
 * Cumulative Modelo 130 for every quarter up to `upToQuarter`, in a single pass over the rows.
 * Each quarter carries the previous payments (casilla 05), so the whole series is needed
 * even when only the last quarter is displayed.
 *
 * Casilla 05 is seeded from what was actually filed and only falls back to the recomputation
 * for quarters with no recorded amount: the AEAT box means money already paid, and a
 * recomputation that drifts from the filing propagates for the rest of the year.
 */
function computeModelo130Series(
  rows: FiscalViewRow[],
  year: number,
  upToQuarter: number,
  filedAmounts: FiledModeloAmounts = new Map(),
): Modelo130Summary[] {
  const quarters = Array.from({ length: upToQuarter }, (_, index) => index + 1);
  const summaries: Modelo130Summary[] = [];

  quarters.reduce<Modelo130Accumulator>(
    (acc, quarter) => {
      const totals = quarterTotals(rows, quarter);

      const ingresosAcum = acc.ingresosAcum + totals.ingresos;
      const gastosDocAcum = acc.gastosDocAcum + totals.gastosDoc;
      const retencionesAcum = acc.retencionesAcum + totals.retenciones;

      const rendimientoPre = ingresosAcum - gastosDocAcum;
      const gastosDificil = calcGastosDificilCents(rendimientoPre);
      const gastosTotal = gastosDocAcum + gastosDificil;

      const beneficio = ingresosAcum - gastosTotal;
      const cuota20 = Math.max(0, Math.round((beneficio * IRPF_RATE) / 100));
      // Casilla 07 = 04 - 05 - 06: what clients already withheld is already in the Treasury.
      const aIngresar = Math.max(0, cuota20 - acc.pagosAnteriores - retencionesAcum);

      summaries.push({
        fiscalYear: year,
        fiscalQuarter: quarter,
        casilla1Cents: ingresosAcum,
        casilla2Cents: gastosTotal,
        casilla3Cents: beneficio,
        casilla4Cents: cuota20,
        casilla5Cents: acc.pagosAnteriores,
        casilla6Cents: retencionesAcum,
        casilla7Cents: aIngresar,
        gastosDocumentadosCents: gastosDocAcum,
        gastosDificilCents: gastosDificil,
        casilla5IsEstimated: acc.anyQuarterEstimated,
      });

      return {
        ingresosAcum,
        gastosDocAcum,
        retencionesAcum,
        pagosAnteriores: acc.pagosAnteriores + settledAmountCents(quarter, aIngresar, filedAmounts),
        anyQuarterEstimated: acc.anyQuarterEstimated || !filedAmounts.has(quarter),
      };
    },
    { ingresosAcum: 0, gastosDocAcum: 0, retencionesAcum: 0, pagosAnteriores: 0, anyQuarterEstimated: false },
  );

  return summaries;
}

/**
 * Compute Modelo 130 summary (user-scoped)
 */
export async function getModelo130Summary(year: number, quarter: number): Promise<Modelo130Summary> {
  const userId = await getUserIdOrThrow();

  // Modelo 130 is cumulative — needs all quarters up to current
  const [rows, filedAmounts] = await Promise.all([
    loadFiscalRows(userId, year, { quarter, cumulative: true }),
    getFiledModeloAmounts(userId, MODELO_TYPE.M130, year),
  ]);

  // The series always covers quarters 1..quarter, which the route already validated as 1-4.
  return computeModelo130Series(rows, year, quarter, filedAmounts)[quarter - 1]!;
}

const ALL_QUARTERS = 4;

/**
 * Quarters whose Modelo 130 filing window has already closed — what the user has paid
 * so far. A quarter still inside its window (e.g. Q3 on 5 October) counts as pending,
 * so it shows up in the remaining-deadlines calendar instead.
 */
function settledM130Quarters(year: number, now: Date = new Date()): number[] {
  return computeDeadlines(year, new Set(), 0, now)
    .filter((deadline) => deadline.modeloType === MODELO_TYPE.M130 && deadline.status === FILING_STATUS.OVERDUE)
    .flatMap((deadline) => (deadline.fiscalQuarter === null ? [] : [deadline.fiscalQuarter]));
}

/**
 * IRPF provision for a year (user-scoped).
 *
 * Modelo 130 withholds a flat 20% of the net income, but the Renta applies a progressive
 * scale: the difference lands in one payment the following June. This projects both and
 * exposes the gap.
 *
 * Reads the same accrual rows as every other model — never "vw_FiscalQuarterly", which
 * would book invoice income on the collection date.
 *
 * @param year - Fiscal year
 * @param options.projectedIncomeCents - Manual override for the annual billing (cents)
 * @param options.now - Current date (injectable for testing; defaults to the real clock)
 */
export async function getIrpfProjection(
  year: number,
  options: { projectedIncomeCents?: number; now?: Date } = {},
): Promise<IrpfProjection> {
  const userId = await getUserIdOrThrow();

  const [rows, filedAmounts] = await Promise.all([
    loadFiscalRows(userId, year),
    getFiledModeloAmounts(userId, MODELO_TYPE.M130, year),
  ]);

  // Same criteria as Modelo 130: professional income only, expenses at their deductible share.
  const ytdIncomeCents = rows
    .filter(isProfessionalIncome)
    .reduce(
      (sum, row) => sum + computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent).baseCents,
      0,
    );
  const ytdExpensesCents = rows
    .filter((row) => row.Type === TRANSACTION_TYPE.EXPENSE)
    .reduce(
      (sum, row) =>
        sum + computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent).baseDeducibleCents,
      0,
    );

  const { elapsedDays, totalDaysInYear } = getYearProgress(year, options.now);
  const projectedIncomeCents =
    options.projectedIncomeCents ?? projectAnnualCents(ytdIncomeCents, elapsedDays, totalDaysInYear);
  const projectedExpensesCents = projectAnnualCents(ytdExpensesCents, elapsedDays, totalDaysInYear);

  const rendimientoPre = projectedIncomeCents - projectedExpensesCents;
  const gastosDificilCents = calcGastosDificilCents(rendimientoPre);
  const projectedNetIncomeCents = rendimientoPre - gastosDificilCents;

  const series = computeModelo130Series(rows, year, ALL_QUARTERS, filedAmounts);

  // What the closed quarters actually settled: the filed casilla 7 when it is known.
  const settled = settledM130Quarters(year, options.now);
  const settledSummaries = series.filter((summary) => settled.includes(summary.fiscalQuarter));
  const modelo130PaidCents = settledSummaries.reduce(
    (sum, summary) => sum + settledAmountCents(summary.fiscalQuarter, summary.casilla7Cents, filedAmounts),
    0,
  );
  const modelo130PaidIsEstimated = settledSummaries.some((summary) => !filedAmounts.has(summary.fiscalQuarter));

  // Casilla 06 is cumulative over the year, so the last quarter already holds the annual total.
  const retencionesCents = series.at(-1)?.casilla6Cents ?? 0;

  const modelo130TotalCents = Math.max(0, Math.round(projectedNetIncomeCents * IRPF_PROJECTION.M130_RATE));
  // The withholdings are money the Treasury already has but that no casilla 07 will ever charge
  // again, so they leave the quarterly instalments still to be filed.
  const modelo130RemainingCents = Math.max(0, modelo130TotalCents - modelo130PaidCents - retencionesCents);

  const estimatedIrpfCents = computeIrpfCents(projectedNetIncomeCents, DEFAULT_IRPF_REGION);

  return {
    fiscalYear: year,
    region: DEFAULT_IRPF_REGION,
    ytdIncomeCents,
    ytdExpensesCents,
    projectedIncomeCents,
    projectedExpensesCents,
    gastosDificilCents,
    projectedNetIncomeCents,
    modelo130PaidCents,
    modelo130PaidIsEstimated,
    modelo130RemainingCents,
    modelo130TotalCents,
    retencionesCents,
    estimatedIrpfCents,
    // The retenciones are NOT subtracted here: casilla 07 = 04 - 05 - 06 already nets them out
    // quarter by quarter, so the four casillas 07 plus the withholdings add up to the whole 20%
    // quota. Subtracting them again would count the withheld IRPF twice and understate the
    // payment the Renta charges the following June.
    provisionGapCents: estimatedIrpfCents - modelo130TotalCents,
    marginalRate: computeMarginalRate(projectedNetIncomeCents, DEFAULT_IRPF_REGION),
    monthlyProvisionCents: Math.round(estimatedIrpfCents / 12),
    effectiveRate:
      projectedNetIncomeCents > 0 ? Math.round((estimatedIrpfCents / projectedNetIncomeCents) * 10_000) / 10_000 : 0,
    // Depends on the elapsed days alone: overriding the billing fixes the income side, but the
    // expenses are still extrapolated from a handful of days, so the projection stays unreliable.
    isProjectionReliable: elapsedDays >= IRPF_PROJECTION.MIN_PROJECTION_DAYS,
  };
}

/**
 * Compute Modelo 390 summary (user-scoped)
 */
export async function getModelo390Summary(year: number): Promise<Modelo390Summary> {
  const userId = await getUserIdOrThrow();

  const rows = await loadFiscalRows(userId, year);

  let totalC09 = 0;
  let totalC28 = 0;
  let totalC29 = 0;
  let totalC120 = 0;

  rows.forEach((row) => {
    const { baseCents, ivaCents, baseDeducibleCents, ivaDeducibleCents } = computeFiscalFields(
      row.FullAmountCents,
      row.VatPercent,
      row.DeductionPercent,
    );

    if (isProfessionalIncome(row)) {
      if (row.VatPercent > 0) {
        totalC09 += ivaCents;
      } else {
        totalC120 += baseCents;
      }
    } else if (row.Type === TRANSACTION_TYPE.EXPENSE && row.VatPercent > 0) {
      totalC28 += baseDeducibleCents;
      totalC29 += ivaDeducibleCents;
    }
  });

  const casilla47 = totalC09;
  const casilla48 = totalC28;
  const casilla49 = totalC29;
  const casilla64 = casilla49;
  const casilla65 = casilla47 - casilla64;
  const casilla84 = casilla65;
  const casilla86 = casilla84;
  const casilla97 = casilla86 < 0 ? Math.abs(casilla86) : 0;

  return {
    fiscalYear: year,
    casilla47Cents: casilla47,
    casilla48Cents: casilla48,
    casilla49Cents: casilla49,
    casilla605Cents: totalC28,
    casilla606Cents: totalC29,
    casilla64Cents: casilla64,
    casilla65Cents: casilla65,
    casilla84Cents: casilla84,
    casilla86Cents: casilla86,
    casilla97Cents: casilla97,
    casilla110Cents: totalC120,
    casilla108Cents: totalC120,
  };
}

/**
 * Compute Modelo 100 summary (user-scoped)
 */
export async function getModelo100Summary(year: number): Promise<Modelo100Section> {
  const userId = await getUserIdOrThrow();

  type Modelo100Row = FiscalViewRow & { Modelo100CasillaCode: string | null };

  // LEFT JOIN, not INNER: invoice rows carry no category, and an inner join would drop them.
  const rows = await query<Modelo100Row>(
    `SELECT v."FiscalYear", v."FiscalQuarter", v."Type", v."TransactionID", v."CategoryID",
            v."CategoryName", v."ParentCategoryName", v."TransactionDate",
            v."VendorName", v."InvoiceNumber", v."Description",
            v."FullAmountCents", v."VatPercent", v."DeductionPercent", v."RetentionCents",
            NULL AS "CompanyTaxId", cat."Modelo100CasillaCode"
     FROM "vw_FiscalAccrual" v
     LEFT JOIN "Categories" cat ON v."CategoryID" = cat."CategoryID"
     WHERE v."FiscalYear" = $1 AND v."UserID" = $2`,
    [year, userId],
  );

  let ingresosCents = 0;
  let gastosDeducCents = 0;
  const casillaMap = new Map<string, number>();

  rows.forEach((row) => {
    const { baseCents, baseDeducibleCents } = computeFiscalFields(
      row.FullAmountCents,
      row.VatPercent,
      row.DeductionPercent,
    );

    if (isProfessionalIncome(row)) {
      ingresosCents += baseCents;
    }
    if (row.Type === TRANSACTION_TYPE.EXPENSE && baseDeducibleCents > 0) {
      gastosDeducCents += baseDeducibleCents;
      const casilla = row.Modelo100CasillaCode ?? MODELO_100_DEFAULT_CASILLA;
      casillaMap.set(casilla, (casillaMap.get(casilla) ?? 0) + baseDeducibleCents);
    }
  });

  const casilla0171 = ingresosCents;
  const casilla0180 = casilla0171;
  const casilla0218 = gastosDeducCents;
  const casilla0221 = casilla0180 - casilla0218;
  const casilla0222 = calcGastosDificilCents(casilla0221);
  const casilla0223 = casilla0218 + casilla0222;
  const casilla0224 = casilla0180 - casilla0223;

  const gastosPorCasilla = [...casillaMap.entries()]
    .map(([casilla, cents]) => ({ casilla, cents }))
    .sort((a, b) => a.casilla.localeCompare(b.casilla));

  return {
    fiscalYear: year,
    casilla0171Cents: casilla0171,
    casilla0180Cents: casilla0180,
    casilla0218Cents: casilla0218,
    casilla0221Cents: casilla0221,
    casilla0222Cents: casilla0222,
    casilla0223Cents: casilla0223,
    casilla0224Cents: casilla0224,
    gastosPorCasilla,
  };
}
