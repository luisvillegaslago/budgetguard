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

import { IRPF_RATE, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';
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
    description: row.Description,
    type: row.Type as FiscalTransaction['type'],
    fullAmountCents: row.FullAmountCents,
    vatPercent: row.VatPercent,
    deductionPercent: row.DeductionPercent,
    ...computed,
  };
}

const FISCAL_VIEW_COLUMNS = `"FiscalYear", "FiscalQuarter", "Type", "TransactionID", "CategoryID",
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
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "FiscalQuarter" = $2
      AND "Type" = $3 AND "UserID" = $4
    ORDER BY "TransactionDate" ASC`,
    [year, quarter, TRANSACTION_TYPE.EXPENSE, userId],
  );

  return rows.map(rowToFiscalTransaction);
}

/**
 * Get fiscal invoices for a specific quarter (user-scoped)
 */
export async function getFiscalInvoices(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "FiscalQuarter" = $2
      AND "Type" = $3
      AND COALESCE("ParentCategoryName", "CategoryName") = $4
      AND "UserID" = $5
    ORDER BY "TransactionDate" ASC`,
    [year, quarter, TRANSACTION_TYPE.INCOME, PROFESSIONAL_INCOME_CATEGORY, userId],
  );

  return rows.map(rowToFiscalTransaction);
}

/**
 * Compute Modelo 303 summary for a single quarter (user-scoped)
 */
export async function getModelo303Summary(year: number, quarter: number): Promise<Modelo303Summary> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "FiscalQuarter" = $2 AND "UserID" = $3`,
    [year, quarter, userId],
  );

  let casilla07 = 0;
  let casilla09 = 0;
  let casilla60 = 0;
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
        casilla60 += baseCents;
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
    casilla60Cents: casilla60,
    resultCents,
  };
}

/**
 * Compute Modelo 130 summary (user-scoped)
 */
export async function getModelo130Summary(year: number, quarter: number): Promise<Modelo130Summary> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "FiscalQuarter" <= $2 AND "UserID" = $3`,
    [year, quarter, userId],
  );

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

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "UserID" = $2`,
    [year, userId],
  );

  let totalC09 = 0;
  let totalC28 = 0;
  let totalC29 = 0;
  let totalC60 = 0;

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
        totalC60 += baseCents;
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
    casilla104Cents: totalC60,
    casilla108Cents: totalC60,
  };
}

/**
 * Compute Modelo 100 summary (user-scoped)
 */
export async function getModelo100Summary(year: number): Promise<Modelo100Section> {
  const userId = await getUserIdOrThrow();

  const rows = await query<FiscalViewRow>(
    `SELECT ${FISCAL_VIEW_COLUMNS}
    FROM "vw_FiscalQuarterly"
    WHERE "FiscalYear" = $1 AND "UserID" = $2`,
    [year, userId],
  );

  let ingresosCents = 0;
  let gastosDeducCents = 0;

  rows.forEach((row) => {
    const { baseCents, baseDeducibleCents } = computeFiscalFields(
      row.FullAmountCents,
      row.VatPercent,
      row.DeductionPercent,
    );

    if (isProfessionalIncome(row)) {
      ingresosCents += baseCents;
    }
    if (row.Type === TRANSACTION_TYPE.EXPENSE) {
      gastosDeducCents += baseDeducibleCents;
    }
  });

  const casilla0171 = ingresosCents;
  const casilla0180 = casilla0171;
  const casilla0218 = gastosDeducCents;
  const casilla0221 = casilla0180 - casilla0218;
  const casilla0222 = calcGastosDificilCents(casilla0221);
  const casilla0223 = casilla0218 + casilla0222;
  const casilla0224 = casilla0180 - casilla0223;

  return {
    fiscalYear: year,
    casilla0171Cents: casilla0171,
    casilla0180Cents: casilla0180,
    casilla0218Cents: casilla0218,
    casilla0221Cents: casilla0221,
    casilla0222Cents: casilla0222,
    casilla0223Cents: casilla0223,
    casilla0224Cents: casilla0224,
  };
}
