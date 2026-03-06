/**
 * BudgetGuard Fiscal Repository
 * Database operations for fiscal reports:
 * - Modelo 303 (IVA trimestral)
 * - Modelo 130 (IRPF trimestral)
 * - Modelo 390 (IVA anual)
 * - Modelo 100 (IRPF anual — sección actividades económicas)
 *
 * Uses vw_FiscalQuarterly for raw data and computeFiscalFields() for derived calculations.
 * All calculations happen in TypeScript (not SQL) for consistent rounding with the frontend.
 */

import sql from 'mssql';
import { IRPF_RATE, PROFESSIONAL_INCOME_CATEGORY, TRANSACTION_TYPE } from '@/constants/finance';
import type {
  FiscalTransaction,
  Modelo100Section,
  Modelo130Summary,
  Modelo303Summary,
  Modelo390Summary,
} from '@/types/finance';
import { calcGastosDificilCents, computeFiscalFields } from '@/utils/fiscal';
import { getConnection } from './connection';

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

/**
 * Transform a fiscal view row to FiscalTransaction with computed fields
 */
function rowToFiscalTransaction(row: FiscalViewRow): FiscalTransaction {
  const computed = computeFiscalFields(row.FullAmountCents, row.VatPercent, row.DeductionPercent);

  return {
    transactionId: row.TransactionID,
    transactionDate: row.TransactionDate.toISOString().split('T')[0] || '',
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

const FISCAL_VIEW_COLUMNS = `FiscalYear, FiscalQuarter, Type, TransactionID, CategoryID,
           CategoryName, ParentCategoryName, TransactionDate,
           VendorName, InvoiceNumber, Description,
           FullAmountCents, VatPercent, DeductionPercent`;

/**
 * Only income from the "Facturas" category counts as professional income.
 * Personal income (SS pensions, personal sales, gifts) is excluded from fiscal models.
 */
function isProfessionalIncome(row: FiscalViewRow): boolean {
  return row.Type === TRANSACTION_TYPE.INCOME && row.ParentCategoryName === PROFESSIONAL_INCOME_CATEGORY;
}

/**
 * Get fiscal expenses (type=expense) for a specific quarter
 */
export async function getFiscalExpenses(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);
  request.input('quarter', sql.Int, quarter);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year AND FiscalQuarter = @quarter
      AND Type = '${TRANSACTION_TYPE.EXPENSE}'
    ORDER BY TransactionDate ASC
  `);

  return result.recordset.map(rowToFiscalTransaction);
}

/**
 * Get fiscal invoices (type=income) for a specific quarter
 */
export async function getFiscalInvoices(year: number, quarter: number): Promise<FiscalTransaction[]> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);
  request.input('quarter', sql.Int, quarter);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year AND FiscalQuarter = @quarter
      AND Type = '${TRANSACTION_TYPE.INCOME}'
      AND COALESCE(ParentCategoryName, CategoryName) = '${PROFESSIONAL_INCOME_CATEGORY}'
    ORDER BY TransactionDate ASC
  `);

  return result.recordset.map(rowToFiscalTransaction);
}

/**
 * Compute Modelo 303 summary for a single quarter
 *
 * IVA Devengado:
 *   - C07/C09 = income invoices WITH VatPercent > 0 (operaciones interiores sujetas)
 *   - C60 = income invoices WITH VatPercent = 0 (exportaciones/exentas con derecho a deducción)
 * IVA Deducible (casillas 28, 29, 45) = expense invoices with VAT > 0
 */
export async function getModelo303Summary(year: number, quarter: number): Promise<Modelo303Summary> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);
  request.input('quarter', sql.Int, quarter);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year AND FiscalQuarter = @quarter
  `);

  let casilla07 = 0;
  let casilla09 = 0;
  let casilla60 = 0;
  let casilla28 = 0;
  let casilla29 = 0;

  result.recordset.forEach((row) => {
    const { baseCents, ivaCents, baseDeducibleCents, ivaDeducibleCents } = computeFiscalFields(
      row.FullAmountCents,
      row.VatPercent,
      row.DeductionPercent,
    );

    if (isProfessionalIncome(row)) {
      if (row.VatPercent > 0) {
        // Operaciones interiores sujetas al tipo impositivo
        casilla07 += baseCents;
        casilla09 += ivaCents;
      } else {
        // Exportaciones / operaciones exentas con derecho a deducción
        casilla60 += baseCents;
      }
    } else if (row.Type === TRANSACTION_TYPE.EXPENSE && row.VatPercent > 0) {
      // IVA Deducible — expenses with VAT
      casilla28 += baseDeducibleCents;
      casilla29 += ivaDeducibleCents;
    }
  });

  const casilla27 = casilla09; // Total IVA devengado
  const casilla45 = casilla29; // Total IVA deducible
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
 * Compute Modelo 130 summary using iterative "snowball" approach
 *
 * Casilla 05 accumulates actual payments (Casilla 07) from previous quarters,
 * NOT just 20% of previous profits. If a quarter had losses, nothing accumulates.
 *
 * Casilla 02 = documented expenses + 5% gastos de difícil justificación (capped at 2000€/year).
 *
 * Single SQL query for all quarters up to the requested one, then iterate in TypeScript.
 */
export async function getModelo130Summary(year: number, quarter: number): Promise<Modelo130Summary> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);
  request.input('quarter', sql.Int, quarter);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year AND FiscalQuarter <= @quarter
  `);

  const rows = result.recordset;

  let ingresosAcum = 0;
  let gastosDocAcum = 0;
  let pagosAnteriores = 0;
  let currentSummary: Modelo130Summary | null = null;

  // Sequential iteration Q1 → Q_current (using indexed for loop, not for...of)
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

    // 5% gastos de difícil justificación (cumulative, capped at 2000€/year)
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

  // Safety: should never be null since quarter >= 1
  return currentSummary!;
}

/**
 * Compute Modelo 390 summary (annual VAT — sum of 4 quarterly 303s)
 * Queries the full year's data and sums up the quarterly results.
 */
export async function getModelo390Summary(year: number): Promise<Modelo390Summary> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year
  `);

  let totalC09 = 0;
  let totalC28 = 0;
  let totalC29 = 0;
  let totalC60 = 0;

  result.recordset.forEach((row) => {
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

  const casilla47 = totalC09; // Total cuotas devengadas
  const casilla48 = totalC28; // Total bases deducibles
  const casilla49 = totalC29; // Total cuotas deducibles
  const casilla64 = casilla49; // Total deducciones
  const casilla65 = casilla47 - casilla64; // Resultado
  const casilla84 = casilla65; // Suma resultados
  const casilla86 = casilla84; // Resultado liquidación
  const casilla97 = casilla86 < 0 ? Math.abs(casilla86) : 0; // A compensar

  return {
    fiscalYear: year,
    casilla47Cents: casilla47,
    casilla48Cents: casilla48,
    casilla49Cents: casilla49,
    casilla605Cents: totalC28, // Base IVA deducible operaciones interiores 21%
    casilla606Cents: totalC29, // Cuota IVA deducible 21%
    casilla64Cents: casilla64,
    casilla65Cents: casilla65,
    casilla84Cents: casilla84,
    casilla86Cents: casilla86,
    casilla97Cents: casilla97,
    casilla104Cents: totalC60, // Exportaciones/exentas con deducción
    casilla108Cents: totalC60, // Total volumen operaciones
  };
}

/**
 * Compute Modelo 100 summary — Economic activities section (Estimación Directa Simplificada)
 * Only the professional activities section; the user completes the rest in Renta Web.
 */
export async function getModelo100Summary(year: number): Promise<Modelo100Section> {
  const pool = await getConnection();
  const request = pool.request();

  request.input('year', sql.Int, year);

  const result = await request.query<FiscalViewRow>(`
    SELECT ${FISCAL_VIEW_COLUMNS}
    FROM vw_FiscalQuarterly
    WHERE FiscalYear = @year
  `);

  let ingresosCents = 0;
  let gastosDeducCents = 0;

  result.recordset.forEach((row) => {
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
