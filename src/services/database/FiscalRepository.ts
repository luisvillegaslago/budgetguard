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
 *
 * Deductible expense has a second source that is not a transaction: the amortization of the
 * inmovilizado (art. 30.2 RIRPF). No money moves when an asset amortizes, so no row of the view
 * can carry it — it enters each model through getAmortizationCentsForPeriod(), which folds the
 * "FixedAssets" of the user over the period the model declares.
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
import { getFiscalProfileForUser } from '@/services/database/FiscalProfileRepository';
import { getAmortizationCentsForPeriod, getAssetTransactionIds } from '@/services/database/FixedAssetRepository';
import type {
  FiscalTransaction,
  IrpfProjection,
  Modelo100Section,
  Modelo130Summary,
  Modelo303Summary,
  Modelo390Summary,
} from '@/types/finance';
import { calcGastosDificilCents, computeFiscalFields, rollVatPoolCents } from '@/utils/fiscal';
import { computeDeadlines } from '@/utils/fiscalDeadlines';
import { toDateString } from '@/utils/helpers';
import {
  computeIrpfCents,
  computeMarginalRate,
  computePensionReductionCents,
  getYearProgress,
  projectAnnualCents,
} from '@/utils/irpf';
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

/** Last calendar day of each quarter, 'MM-DD'. A quarter is a fixed span; no date maths needed. */
const QUARTER_END_DAY = ['03-31', '06-30', '09-30', '12-31'] as const;

/**
 * Amortization accrued from 1 January to the end of each quarter 1..upToQuarter, in cents.
 *
 * Cumulative rather than per quarter because that is exactly what the models declare: Modelo 130
 * restates the year to date at every filing, and the annual models want the last entry. The
 * quarterly slice is the difference between two consecutive entries, and nothing needs it.
 *
 * Each entry is a separate fold over the same handful of assets, which keeps the "how much falls
 * in this period" rule in amortizationCentsBetween() alone — splitting a year into four prorated
 * chunks here would be a second implementation of it, free to drift by a cent.
 */
async function loadCumulativeAmortization(userId: number, year: number, upToQuarter: number): Promise<number[]> {
  const totals = await Promise.all(
    // The quarter is validated as 1-4 before it reaches any of the callers.
    Array.from({ length: upToQuarter }, (_, index) =>
      getAmortizationCentsForPeriod(userId, `${year}-01-01`, `${year}-${QUARTER_END_DAY[index]!}`),
    ),
  );

  return totals.map((total) => total.totalCents);
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
 * Income of the quarter that no model counts (user-scoped).
 *
 * Only "Facturas" income is professional activity, so everything else — a benefit payment, a
 * private sale — stays out of the 303/130/390/100 by design. Showing it is the point: an
 * invoice filed under the wrong category would otherwise disappear from every model in silence,
 * which is exactly how the 2023 income went missing for a year.
 */
export async function getUncountedIncome(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await loadFiscalRows(userId, year, { quarter, cumulative: false });

  return rows
    .filter((row) => row.Type === TRANSACTION_TYPE.INCOME && !isProfessionalIncome(row))
    .map(rowToFiscalTransaction);
}

interface Modelo303Totals {
  casilla07: number;
  casilla09: number;
  casilla120: number;
  casilla28: number;
  casilla29: number;
}

/** The 303 boxes of a single quarter, from that quarter's accrual rows. */
function modelo303Totals(rows: FiscalViewRow[]): Modelo303Totals {
  return rows.reduce<Modelo303Totals>(
    (totals, row) => {
      const { baseCents, ivaCents, baseDeducibleCents, ivaDeducibleCents } = computeFiscalFields(
        row.FullAmountCents,
        row.VatPercent,
        row.DeductionPercent,
      );

      const professional = isProfessionalIncome(row);
      const withVat = row.VatPercent > 0;
      const deductibleExpense = row.Type === TRANSACTION_TYPE.EXPENSE && withVat;

      return {
        casilla07: totals.casilla07 + (professional && withVat ? baseCents : 0),
        casilla09: totals.casilla09 + (professional && withVat ? ivaCents : 0),
        casilla120: totals.casilla120 + (professional && !withVat ? baseCents : 0),
        casilla28: totals.casilla28 + (deductibleExpense ? baseDeducibleCents : 0),
        casilla29: totals.casilla29 + (deductibleExpense ? ivaDeducibleCents : 0),
      };
    },
    { casilla07: 0, casilla09: 0, casilla120: 0, casilla28: 0, casilla29: 0 },
  );
}

/** A quarter's own result: output VAT minus deductible VAT. Negative means "a compensar". */
const modelo303Result = (totals: Modelo303Totals): number => totals.casilla09 - totals.casilla29;

/**
 * Compute Modelo 303 summary for a single quarter (user-scoped)
 */
export async function getModelo303Summary(year: number, quarter: number): Promise<Modelo303Summary> {
  const userId = await getUserIdOrThrow();

  // Cumulative rows: the earlier quarters are needed to roll the compensation pool forward
  const [rows, profile] = await Promise.all([
    loadFiscalRows(userId, year, { quarter, cumulative: true }),
    getFiscalProfileForUser(userId, year),
  ]);

  const totals = modelo303Totals(rows.filter((row) => row.FiscalQuarter === quarter));
  const casilla27 = totals.casilla09;
  const casilla45 = totals.casilla29;
  const resultCents = casilla27 - casilla45;

  // Casilla 110: the pool as it stands when this quarter is filed
  const earlierResults = Array.from({ length: quarter - 1 }, (_, index) =>
    modelo303Result(modelo303Totals(rows.filter((row) => row.FiscalQuarter === index + 1))),
  );
  const vatPoolOpeningCents = rollVatPoolCents(profile.vatPoolOpeningCents, earlierResults);
  const vatPoolClosingCents = rollVatPoolCents(vatPoolOpeningCents, [resultCents]);

  // Output VAT is what a pool gets compensated against. With none in the whole year — every
  // client outside Spain — the balance can only grow, and the refund is the only way out.
  const outputVatThisYear = modelo303Totals(rows).casilla09;

  return {
    fiscalYear: year,
    fiscalQuarter: quarter,
    casilla07Cents: totals.casilla07,
    casilla09Cents: totals.casilla09,
    casilla27Cents: casilla27,
    casilla28Cents: totals.casilla28,
    casilla29Cents: totals.casilla29,
    casilla45Cents: casilla45,
    casilla120Cents: totals.casilla120,
    resultCents,
    vatPoolOpeningCents,
    vatPoolClosingCents,
    vatPoolIsStranded: outputVatThisYear === 0 && vatPoolClosingCents > 0,
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

/**
 * Income, documented expenses and withholdings of a single quarter.
 *
 * `assetTransactionIds` are the purchases that became inmovilizado. They are skipped here because
 * their cost reaches this model through the amortization instead; counting the purchase as well
 * would deduct the same asset twice. They are NOT skipped in Modelo 303 or 390 — the input VAT of
 * an asset is deducted in full in the quarter of purchase and is never amortized.
 */
function quarterTotals(rows: FiscalViewRow[], quarter: number, assetTransactionIds: Set<number>): QuarterTotals {
  return rows
    .filter((row) => row.FiscalQuarter === quarter && !assetTransactionIds.has(row.TransactionID))
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
 *
 * `cumulativeAmortizationCents` arrives already accumulated from 1 January (one entry per
 * quarter), so it is read rather than summed: the dotación of a quarter is a span of the
 * calendar, not the sum of what the earlier quarters happened to hold.
 */
function computeModelo130Series(
  rows: FiscalViewRow[],
  year: number,
  upToQuarter: number,
  filedAmounts: FiledModeloAmounts,
  cumulativeAmortizationCents: number[],
  assetTransactionIds: Set<number>,
): Modelo130Summary[] {
  const quarters = Array.from({ length: upToQuarter }, (_, index) => index + 1);
  const summaries: Modelo130Summary[] = [];

  quarters.reduce<Modelo130Accumulator>(
    (acc, quarter) => {
      const totals = quarterTotals(rows, quarter, assetTransactionIds);

      const ingresosAcum = acc.ingresosAcum + totals.ingresos;
      const gastosDocAcum = acc.gastosDocAcum + totals.gastosDoc;
      const retencionesAcum = acc.retencionesAcum + totals.retenciones;
      const amortizacionAcum = cumulativeAmortizationCents[quarter - 1] ?? 0;

      // The 5% of art. 30 RIRPF falls on the rendimiento, so the dotación lowers its base too:
      // it is a deductible expense of the year like any other, only one that moved no money.
      const rendimientoPre = ingresosAcum - gastosDocAcum - amortizacionAcum;
      const gastosDificil = calcGastosDificilCents(rendimientoPre);
      const gastosTotal = gastosDocAcum + amortizacionAcum + gastosDificil;

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
        amortizacionCents: amortizacionAcum,
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
  const [rows, filedAmounts, cumulativeAmortization, assetTransactionIds] = await Promise.all([
    loadFiscalRows(userId, year, { quarter, cumulative: true }),
    getFiledModeloAmounts(userId, MODELO_TYPE.M130, year),
    loadCumulativeAmortization(userId, year, quarter),
    getAssetTransactionIds(userId),
  ]);

  // The series always covers quarters 1..quarter, which the route already validated as 1-4.
  return computeModelo130Series(rows, year, quarter, filedAmounts, cumulativeAmortization, assetTransactionIds)[
    quarter - 1
  ]!;
}

const ALL_QUARTERS = 4;

/** [1, 2, 3, 4] — the quarters of a fiscal year, in order. */
const ALL_QUARTER_NUMBERS = Array.from({ length: ALL_QUARTERS }, (_, index) => index + 1);

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
 * The pension contributions of the annual fiscal profile lower the base the scale taxes, but
 * only there: Modelo 130 is left untouched, which is exactly why the gap shrinks.
 *
 * The dotación of the inmovilizado lowers the net income of both sides, and it is the one figure
 * here that is never projected — see amortizacionCents below.
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

  const [rows, filedAmounts, profile, cumulativeAmortization, assetTransactionIds] = await Promise.all([
    loadFiscalRows(userId, year),
    getFiledModeloAmounts(userId, MODELO_TYPE.M130, year),
    getFiscalProfileForUser(userId, year),
    loadCumulativeAmortization(userId, year, ALL_QUARTERS),
    getAssetTransactionIds(userId),
  ]);

  // Same criteria as Modelo 130: professional income only, expenses at their deductible share.
  const ytdIncomeCents = rows
    .filter(isProfessionalIncome)
    .reduce(
      (sum, row) => sum + computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent).baseCents,
      0,
    );
  // An asset's purchase is excluded: it reaches the projection as amortization, below.
  const ytdExpensesCents = rows
    .filter((row) => row.Type === TRANSACTION_TYPE.EXPENSE && !assetTransactionIds.has(row.TransactionID))
    .reduce(
      (sum, row) =>
        sum + computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent).baseDeducibleCents,
      0,
    );

  const { elapsedDays, totalDaysInYear } = getYearProgress(year, options.now);
  const projectedIncomeCents =
    options.projectedIncomeCents ?? projectAnnualCents(ytdIncomeCents, elapsedDays, totalDaysInYear);
  const projectedExpensesCents = projectAnnualCents(ytdExpensesCents, elapsedDays, totalDaysInYear);

  // The whole year's dotación, taken as it stands and NOT extrapolated: the run-rate multiplies a
  // year-to-date figure by the elapsed-days factor, and the schedule of an asset already covers
  // every day of the year. Projecting it would invent expense no asset backs — in January it would
  // inflate the December figure roughly thirtyfold. Amortization is a calendar, not a run rate.
  // It stays out of ytd/projectedExpensesCents for the same reason: those two are the run-rate pair.
  const amortizacionCents = cumulativeAmortization.at(-1) ?? 0;

  const rendimientoPre = projectedIncomeCents - projectedExpensesCents - amortizacionCents;
  const gastosDificilCents = calcGastosDificilCents(rendimientoPre);
  const projectedNetIncomeCents = rendimientoPre - gastosDificilCents;

  // Pension contributions reduce the base imponible general of the annual Renta (arts. 51-52
  // Ley 35/2006) and nothing else: the pagos fraccionados of art. 110 RIRPF ignore them. So the
  // reduced base feeds the progressive scale only, and the whole Modelo 130 side below keeps
  // reading projectedNetIncomeCents.
  const pensionReductionCents = computePensionReductionCents(
    profile.pensionIndividualCents,
    profile.pensionEmploymentCents,
    projectedNetIncomeCents,
  );
  // The reduction never exceeds the net income, so a positive base can never turn negative;
  // a loss-making year keeps its negative figure, which the scale already treats as zero.
  const baseLiquidableCents = projectedNetIncomeCents - pensionReductionCents;

  const series = computeModelo130Series(
    rows,
    year,
    ALL_QUARTERS,
    filedAmounts,
    cumulativeAmortization,
    assetTransactionIds,
  );

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

  const estimatedIrpfCents = computeIrpfCents(baseLiquidableCents, DEFAULT_IRPF_REGION);

  return {
    fiscalYear: year,
    region: DEFAULT_IRPF_REGION,
    ytdIncomeCents,
    ytdExpensesCents,
    projectedIncomeCents,
    projectedExpensesCents,
    amortizacionCents,
    gastosDificilCents,
    projectedNetIncomeCents,
    pensionIndividualCents: profile.pensionIndividualCents,
    pensionEmploymentCents: profile.pensionEmploymentCents,
    pensionReductionCents,
    baseLiquidableCents,
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
    // On the reduced base: it is the rate the next euro billed would actually pay.
    marginalRate: computeMarginalRate(baseLiquidableCents, DEFAULT_IRPF_REGION),
    monthlyProvisionCents: Math.round(estimatedIrpfCents / 12),
    // Still divided by the rendimiento neto, not by the reduced base: the card reads this as
    // "tax over what I earned". Dividing by the base would silently redefine the percentage.
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

  // Casillas 97 and 662 split the year's "a compensar" by period, which is what the AEAT
  // reconciles against the quarterly 303s: 97 carries ONLY the last period's own result —
  // the form says "si el resultado de la autoliquidación del último periodo es a compensar" —
  // and 662 the amounts generated in the other quarters. Putting the annual aggregate in 97,
  // as this did, mismatches the 4T 303 by the whole of the rest of the year.
  const quarterCompensations = ALL_QUARTER_NUMBERS.map((quarter) =>
    Math.max(0, -modelo303Result(modelo303Totals(rows.filter((row) => row.FiscalQuarter === quarter)))),
  );
  const casilla97 = quarterCompensations[ALL_QUARTERS - 1] ?? 0;
  const casilla662 = quarterCompensations.slice(0, ALL_QUARTERS - 1).reduce((sum, cents) => sum + cents, 0);

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
    casilla662Cents: casilla662,
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
  const [rows, amortization, assetTransactionIds] = await Promise.all([
    query<Modelo100Row>(
      `SELECT v."FiscalYear", v."FiscalQuarter", v."Type", v."TransactionID", v."CategoryID",
            v."CategoryName", v."ParentCategoryName", v."TransactionDate",
            v."VendorName", v."InvoiceNumber", v."Description",
            v."FullAmountCents", v."VatPercent", v."DeductionPercent", v."RetentionCents",
            NULL AS "CompanyTaxId", cat."Modelo100CasillaCode"
     FROM "vw_FiscalAccrual" v
     LEFT JOIN "Categories" cat ON v."CategoryID" = cat."CategoryID"
     WHERE v."FiscalYear" = $1 AND v."UserID" = $2`,
      [year, userId],
    ),
    getAmortizationCentsForPeriod(userId, `${year}-01-01`, `${year}-12-31`),
    getAssetTransactionIds(userId),
  ]);

  let ingresosCents = 0;
  let gastosDeducCents = 0;
  // What the fallback absorbed. Without this the breakdown looks complete: every euro shows up
  // under some casilla, and a category nobody ever mapped is indistinguishable from a deliberate
  // "otros servicios exteriores".
  let unmappedCents = 0;
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
    // The purchase of an asset is not an expense of the year: it enters below as amortization.
    // Skipped here rather than zeroed on the transaction, because DeductionPercent also drives the
    // deductible VAT, which an asset keeps in full in the quarter it was bought.
    if (assetTransactionIds.has(row.TransactionID)) return;

    if (row.Type === TRANSACTION_TYPE.EXPENSE && baseDeducibleCents > 0) {
      gastosDeducCents += baseDeducibleCents;
      const casilla = row.Modelo100CasillaCode ?? MODELO_100_DEFAULT_CASILLA;
      if (row.Modelo100CasillaCode === null) unmappedCents += baseDeducibleCents;
      casillaMap.set(casilla, (casillaMap.get(casilla) ?? 0) + baseDeducibleCents);
    }
  });

  // The dotación of the year is deductible expense like any of the rows above, but no row can
  // carry it: nothing was paid this year, the money left when the asset was bought. It arrives
  // already split by its own box — 0208 inmovilizado material, 0227 intangible — so it lands as
  // its own line of the breakdown instead of hiding inside a category's casilla. `unmappedCents`
  // is untouched on purpose: an asset always declares its casilla, it never falls back.
  gastosDeducCents += amortization.totalCents;
  amortization.byCasilla.forEach((cents, casilla) => {
    casillaMap.set(casilla, (casillaMap.get(casilla) ?? 0) + cents);
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
    unmappedCents,
  };
}
