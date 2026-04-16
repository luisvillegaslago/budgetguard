/**
 * BudgetGuard Fiscal Repository
 * Database operations for fiscal reports (user-scoped):
 * - Modelo 303 (IVA trimestral)
 * - Modelo 130 (IRPF trimestral)
 * - Modelo 390 (IVA anual)
 * - Modelo 100 (IRPF anual — sección actividades económicas)
 *
 * Uses vw_FiscalQuarterly for raw data and computeFiscalFields() for derived calculations.
 * All calculations happen in TypeScript (not SQL) for consistent rounding with the frontend.
 */

import {
  INVOICE_STATUS,
  IRPF_RATE,
  MODELO_100_DEFAULT_CASILLA,
  PROFESSIONAL_INCOME_CATEGORY,
  TRANSACTION_TYPE,
} from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import type {
  FiscalTransaction,
  Modelo100Section,
  Modelo130Summary,
  Modelo303Summary,
  Modelo390Summary,
} from '@/types/finance';
import { calcGastosDificilCents, computeFiscalFields } from '@/utils/fiscal';
import { toDateString } from '@/utils/helpers';
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
           v."FullAmountCents", v."VatPercent", v."DeductionPercent",
           co."TaxId" AS "CompanyTaxId"`;

const FISCAL_FROM = `FROM "vw_FiscalQuarterly" v
    LEFT JOIN "Transactions" t2 ON v."TransactionID" = t2."TransactionID"
    LEFT JOIN "Companies" co ON t2."CompanyID" = co."CompanyID"`;

const FISCAL_VIEW_COLUMNS_SIMPLE = `"FiscalYear", "FiscalQuarter", "Type", "TransactionID", "CategoryID",
           "CategoryName", "ParentCategoryName", "TransactionDate",
           "VendorName", "InvoiceNumber", "Description",
           "FullAmountCents", "VatPercent", "DeductionPercent"`;

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

/**
 * Fetch finalized (not yet paid) invoices as synthetic FiscalViewRows.
 * Paid invoices are already in vw_FiscalQuarterly via their transactions,
 * so we only add finalized ones to avoid double-counting.
 */
async function getUnpaidInvoiceRows(userId: number, year: number, quarter?: number): Promise<FiscalViewRow[]> {
  const conditions = ['i."UserID" = $1', 'i."Status" = $2', 'EXTRACT(YEAR FROM i."InvoiceDate") = $3'];
  const params: unknown[] = [userId, INVOICE_STATUS.FINALIZED, year];

  if (quarter != null) {
    params.push(quarter);
    conditions.push(`CEIL(EXTRACT(MONTH FROM i."InvoiceDate") / 3.0) = $${params.length}`);
  }

  const rows = await query<{
    InvoiceDate: Date;
    TotalCents: number;
    FiscalQuarter: number;
  }>(
    `SELECT i."InvoiceDate", i."TotalCents",
            CEIL(EXTRACT(MONTH FROM i."InvoiceDate") / 3.0)::int AS "FiscalQuarter"
     FROM "Invoices" i
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  return rows.map((row) => ({
    FiscalYear: year,
    FiscalQuarter: row.FiscalQuarter,
    Type: TRANSACTION_TYPE.INCOME,
    TransactionID: 0,
    CategoryID: 0,
    CategoryName: PROFESSIONAL_INCOME_CATEGORY,
    ParentCategoryName: PROFESSIONAL_INCOME_CATEGORY,
    TransactionDate: row.InvoiceDate,
    VendorName: null,
    InvoiceNumber: null,
    Description: null,
    FullAmountCents: Number(row.TotalCents),
    VatPercent: 0,
    DeductionPercent: 0,
    CompanyTaxId: null,
  }));
}

interface IssuedInvoiceRow {
  InvoiceID: number;
  InvoiceNumber: string;
  InvoiceDate: Date;
  TotalCents: number;
  ClientName: string;
  ClientTaxId: string | null;
  LineItemsDescription: string | null;
}

function issuedInvoiceToFiscalTransaction(row: IssuedInvoiceRow): FiscalTransaction {
  const totalCents = Number(row.TotalCents);
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
    fullAmountCents: totalCents,
    vatPercent: 0,
    deductionPercent: 0,
    baseCents: totalCents,
    ivaCents: 0,
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
    `SELECT i."InvoiceID", i."InvoiceNumber", i."InvoiceDate", i."TotalCents",
            i."ClientName", i."ClientTaxId",
            STRING_AGG(li."Description", ', ' ORDER BY li."SortOrder") AS "LineItemsDescription"
     FROM "Invoices" i
     LEFT JOIN "InvoiceLineItems" li ON li."InvoiceID" = i."InvoiceID"
     WHERE i."UserID" = $1
       AND i."Status" IN ($2, $3)
       AND EXTRACT(YEAR FROM i."InvoiceDate") = $4
       AND CEIL(EXTRACT(MONTH FROM i."InvoiceDate") / 3.0) = $5
     GROUP BY i."InvoiceID", i."InvoiceNumber", i."InvoiceDate", i."TotalCents",
              i."ClientName", i."ClientTaxId"
     ORDER BY i."InvoiceDate" ASC`,
    [userId, INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID, year, quarter],
  );

  return rows.map(issuedInvoiceToFiscalTransaction);
}

/**
 * Compute Modelo 303 summary for a single quarter (user-scoped)
 */
export async function getModelo303Summary(year: number, quarter: number): Promise<Modelo303Summary> {
  const userId = await getUserIdOrThrow();

  const [viewRows, invoiceRows] = await Promise.all([
    query<FiscalViewRow>(
      `SELECT ${FISCAL_VIEW_COLUMNS_SIMPLE}, NULL AS "CompanyTaxId"
      FROM "vw_FiscalQuarterly"
      WHERE "FiscalYear" = $1 AND "FiscalQuarter" = $2 AND "UserID" = $3`,
      [year, quarter, userId],
    ),
    getUnpaidInvoiceRows(userId, year, quarter),
  ]);

  const rows = [...viewRows, ...invoiceRows];

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

/**
 * Compute Modelo 130 summary (user-scoped)
 */
export async function getModelo130Summary(year: number, quarter: number): Promise<Modelo130Summary> {
  const userId = await getUserIdOrThrow();

  // Modelo 130 is cumulative — needs all quarters up to current
  const [viewRows, invoiceRows] = await Promise.all([
    query<FiscalViewRow>(
      `SELECT ${FISCAL_VIEW_COLUMNS_SIMPLE}, NULL AS "CompanyTaxId"
      FROM "vw_FiscalQuarterly"
      WHERE "FiscalYear" = $1 AND "FiscalQuarter" <= $2 AND "UserID" = $3`,
      [year, quarter, userId],
    ),
    getUnpaidInvoiceRows(userId, year),
  ]);

  // Filter invoice rows to quarters <= current (matching view query)
  const rows = [...viewRows, ...invoiceRows.filter((r) => r.FiscalQuarter <= quarter)];

  let ingresosAcum = 0;
  let gastosDocAcum = 0;
  let pagosAnteriores = 0;
  let currentSummary: Modelo130Summary | null = null;

  for (let q = 1; q <= quarter; q++) {
    const qRows = rows.filter((r) => r.FiscalQuarter === q);

    qRows.forEach((row) => {
      const { baseCents, baseDeducibleCents } = computeFiscalFields(
        row.FullAmountCents,
        row.VatPercent,
        row.DeductionPercent,
      );

      if (isProfessionalIncome(row)) {
        ingresosAcum += baseCents;
      }
      if (row.Type === TRANSACTION_TYPE.EXPENSE) {
        gastosDocAcum += baseDeducibleCents;
      }
    });

    const rendimientoPre = ingresosAcum - gastosDocAcum;
    const gastosDificil = calcGastosDificilCents(rendimientoPre);
    const gastosTotal = gastosDocAcum + gastosDificil;

    const beneficio = ingresosAcum - gastosTotal;
    const cuota20 = Math.max(0, Math.round((beneficio * IRPF_RATE) / 100));
    const aIngresar = Math.max(0, cuota20 - pagosAnteriores);

    if (q === quarter) {
      currentSummary = {
        fiscalYear: year,
        fiscalQuarter: quarter,
        casilla1Cents: ingresosAcum,
        casilla2Cents: gastosTotal,
        casilla3Cents: beneficio,
        casilla4Cents: cuota20,
        casilla5Cents: pagosAnteriores,
        casilla7Cents: aIngresar,
        gastosDocumentadosCents: gastosDocAcum,
        gastosDificilCents: gastosDificil,
      };
    }

    pagosAnteriores += aIngresar;
  }

  return currentSummary!;
}

/**
 * Compute Modelo 390 summary (user-scoped)
 */
export async function getModelo390Summary(year: number): Promise<Modelo390Summary> {
  const userId = await getUserIdOrThrow();

  const [viewRows, invoiceRows] = await Promise.all([
    query<FiscalViewRow>(
      `SELECT ${FISCAL_VIEW_COLUMNS_SIMPLE}, NULL AS "CompanyTaxId"
      FROM "vw_FiscalQuarterly"
      WHERE "FiscalYear" = $1 AND "UserID" = $2`,
      [year, userId],
    ),
    getUnpaidInvoiceRows(userId, year),
  ]);

  const rows = [...viewRows, ...invoiceRows];

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

  const [viewRows, invoiceRows] = await Promise.all([
    query<Modelo100Row>(
      `SELECT v."FiscalYear", v."FiscalQuarter", v."Type", v."TransactionID", v."CategoryID",
              v."CategoryName", v."ParentCategoryName", v."TransactionDate",
              v."VendorName", v."InvoiceNumber", v."Description",
              v."FullAmountCents", v."VatPercent", v."DeductionPercent",
              NULL AS "CompanyTaxId", cat."Modelo100CasillaCode"
      FROM "vw_FiscalQuarterly" v
      INNER JOIN "Categories" cat ON v."CategoryID" = cat."CategoryID"
      WHERE v."FiscalYear" = $1 AND v."UserID" = $2`,
      [year, userId],
    ),
    getUnpaidInvoiceRows(userId, year),
  ]);

  const rows: Modelo100Row[] = [...viewRows, ...invoiceRows.map((r) => ({ ...r, Modelo100CasillaCode: null }))];

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
