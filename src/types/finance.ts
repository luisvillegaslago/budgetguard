/**
 * BudgetGuard Finance Types
 * All monetary amounts use cents (integers) internally to avoid floating point errors
 */

import type {
  AmortizationCasilla,
  AmortizationGroupNumber,
  CompanyRole,
  FilingStatus,
  FiscalDocumentType,
  FiscalStatus,
  InvoiceStatus,
  IrpfRegion,
  ModeloType,
  OccurrenceStatus,
  PaymentMethod,
  RecurringFrequency,
  TransactionStatus,
  TransactionType,
} from '@/constants/finance';
import type { AmortizationYear } from '@/utils/amortization';

// Re-export from constants (single source of truth)
export type {
  AmortizationCasilla,
  AmortizationGroupNumber,
  CompanyRole,
  DateRangePreset,
  FilingStatus,
  FiscalDocumentType,
  FiscalQuarter,
  FiscalStatus,
  InvoiceStatus,
  IrpfRegion,
  ModeloType,
  OccurrenceStatus,
  PaymentMethod,
  RecurringFrequency,
  StatusFilter,
  TransactionStatus,
  TransactionType,
  TripStatus,
  VatRate,
  VisionFailureReason,
  VoucherStatus,
} from '@/constants/finance';

// Re-export the amortization primitives so a consumer of FixedAssetSchedule needs one import
export type { AmortizableAsset, AmortizationYear } from '@/utils/amortization';

/**
 * Company/Provider for normalized vendor data and fiscal billing details
 */
export interface Company {
  companyId: number;
  name: string;
  tradingName: string | null;
  taxId: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  invoiceLanguage: string | null;
  role: CompanyRole;
  defaultBankFeeCents: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Category for organizing transactions
 */
export interface Category {
  categoryId: number;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  parentCategoryId: number | null;
  defaultShared: boolean;
  defaultVatPercent: number | null;
  defaultDeductionPercent: number | null;
  modelo100CasillaCode?: string | null;
  subcategories?: Category[];
}

/**
 * Transaction record (income or expense)
 * AmountCents is stored in cents: 41928 = 419.28
 */
export interface Transaction {
  transactionId: number;
  categoryId: number;
  category?: Category;
  parentCategory?: { categoryId: number; name: string } | null;
  amountCents: number;
  description: string | null;
  transactionDate: string; // ISO date "2025-01-15"
  type: TransactionType;
  status: TransactionStatus;
  sharedDivisor: number;
  originalAmountCents: number | null;
  recurringExpenseId: number | null;
  transactionGroupId: number | null;
  tripId: number | null;
  tripName: string | null;
  vatPercent: number | null;
  deductionPercent: number | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  companyId: number | null;
  fiscalDocumentId: number | null;
  voucherId: number | null;
  voucherUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Voucher ("bono") — a prepaid balance consumed through linked expense transactions.
 * Balance fields (consumed/remaining) come from vw_VoucherBalance, computed in SQL.
 * Amounts are in cents; units (min/clases) are decimals.
 */
export interface Voucher {
  voucherId: number;
  categoryId: number;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  description: string | null;
  totalAmountCents: number;
  totalUnits: number | null;
  unitLabel: string | null;
  purchaseDate: string; // ISO date "2025-01-15"
  expiryDate: string | null;
  consumedCents: number;
  remainingCents: number;
  consumedUnits: number;
  consumptionCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Recurring expense rule
 */
export interface RecurringExpense {
  recurringExpenseId: number;
  categoryId: number;
  category?: Category;
  amountCents: number;
  description: string | null;
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  sharedDivisor: number;
  originalAmountCents: number | null;
  vatPercent: number | null;
  deductionPercent: number | null;
  vendorName: string | null;
  companyId: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating/updating a recurring expense (user enters euros)
 */
export interface RecurringExpenseInput {
  categoryId: number;
  amount: number;
  description: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
  isShared?: boolean;
  vatPercent?: number | null;
  deductionPercent?: number | null;
  vendorName?: string | null;
  companyId?: number | null;
}

/**
 * Individual occurrence of a recurring expense
 */
export interface RecurringOccurrence {
  occurrenceId: number;
  recurringExpenseId: number;
  occurrenceDate: string;
  status: OccurrenceStatus;
  transactionId: number | null;
  modifiedAmountCents: number | null;
  processedAt: string | null;
  recurringExpense: RecurringExpense;
}

/**
 * Pending occurrences grouped by month
 */
export interface PendingOccurrenceMonth {
  month: string;
  occurrences: RecurringOccurrence[];
  totalPendingCents: number;
  count: number;
}

/**
 * Summary of all pending occurrences
 */
export interface PendingOccurrencesSummary {
  months: PendingOccurrenceMonth[];
  totalCount: number;
}

/**
 * Derived grouping of transactions sharing the same TransactionGroupID
 * Used for displaying grouped transactions (e.g., outings) in the UI
 */
export interface TransactionGroupDisplay {
  transactionGroupId: number;
  description: string | null;
  transactionDate: string;
  parentCategoryName: string;
  parentCategoryIcon: string | null;
  parentCategoryColor: string | null;
  totalAmountCents: number;
  isShared: boolean;
  type: TransactionType;
  transactions: Transaction[];
}

/**
 * Derived grouping of trip transactions for display in TransactionList
 * Groups all transactions sharing the same TripID into a collapsible row
 */
export interface TripGroupDisplay {
  tripId: number;
  tripName: string;
  startDate: string; // min(transactionDate) of visible transactions
  totalAmountCents: number;
  type: TransactionType;
  transactions: Transaction[];
}

/**
 * Input for creating a transaction group
 */
export interface TransactionGroupInput {
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;
  parentCategoryId: number;
  items: Array<{ categoryId: number; amount: number }>;
}

/**
 * Input for updating a transaction group (description and date only)
 */
export interface TransactionGroupUpdateInput {
  description?: string;
  transactionDate?: Date;
}

/**
 * Category summary for monthly reports
 */
export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  type: TransactionType;
  totalCents: number;
  transactionCount: number;
}

/**
 * Raw monthly summary data (cents - for internal use)
 */
export interface MonthlySummary {
  month: string; // "2025-01"
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  byCategory: CategorySummary[];
}

/**
 * Formatted category summary for UI display
 */
export interface FormattedCategorySummary extends CategorySummary {
  total: string; // Formatted: "419,28"
  totalValue: number; // Euros: 419.28
  percentage: number; // Percentage of total for that type
}

/**
 * Formatted monthly summary for UI display
 */
export interface FormattedSummary {
  month: string;
  income: string; // Formatted: "447,70"
  incomeValue: number; // Euros: 447.70
  expense: string; // Formatted: "2.697,16"
  expenseValue: number; // Euros: 2697.16
  balance: string; // Formatted: "-2.249,46"
  balanceValue: number; // Euros: -2249.46
  byCategory: FormattedCategorySummary[];
}

/**
 * Single month data point for trend charts (cents - for internal use)
 */
export interface MonthlyTrendPoint {
  month: string; // "2025-01"
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

/**
 * Multi-month income/expense/balance trends (cents - for internal use)
 */
export interface MonthlySummaryTrends {
  fromMonth: string; // "2024-06"
  toMonth: string; // "2025-05"
  points: MonthlyTrendPoint[];
}

/**
 * Formatted single month data point for trend charts (UI display)
 */
export interface FormattedTrendPoint {
  month: string; // "2025-01"
  income: string; // Formatted: "447,70 €"
  incomeValue: number; // Euros: 447.70
  expense: string;
  expenseValue: number;
  balance: string;
  balanceValue: number;
  cumulativeBalanceValue: number; // Running sum of balanceValue across the range
}

/**
 * Formatted multi-month trends (UI display)
 */
export interface FormattedMonthlySummaryTrends {
  fromMonth: string;
  toMonth: string;
  points: FormattedTrendPoint[];
}

/**
 * Per-month expense total for a single category (cents - for internal use)
 */
export interface CategoryTrendRow {
  month: string; // "2025-01"
  categoryId: number;
  categoryName: string;
  categoryColor: string | null;
  totalCents: number;
}

/**
 * Expense-by-category trends across a month range (cents - for internal use)
 */
export interface CategoryTrends {
  fromMonth: string;
  toMonth: string;
  rows: CategoryTrendRow[];
}

/**
 * Transaction input from forms (user enters euros, not cents)
 */
export interface TransactionInput {
  categoryId: number;
  amount: number; // Euros with decimals (UI input)
  description: string;
  transactionDate: Date;
  type: TransactionType;
  isShared?: boolean;
}

/**
 * Subcategory summary for drill-down within a parent category
 */
export interface SubcategorySummary {
  parentCategoryId: number;
  subcategoryId: number;
  subcategoryName: string;
  subcategoryIcon: string | null;
  subcategoryColor: string | null;
  isSubcategory: boolean;
  totalCents: number;
  transactionCount: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}

/**
 * Pagination params for list endpoints
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Transaction filters
 */
export interface TransactionFilters {
  month?: string; // "2025-01"
  type?: TransactionType;
  categoryId?: number;
}

/**
 * Trip for multi-day, multi-category travel expense tracking
 */
export interface Trip {
  tripId: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  /** Shared trip: new expenses default to the shared (÷2) option */
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Category summary within a trip (totals per category)
 */
export interface TripCategorySummary {
  categoryId: number;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  totalCents: number;
  count: number;
}

/**
 * Trip with aggregated display data for list view
 */
export interface TripDisplay extends Trip {
  expenseCount: number;
  totalCents: number;
  categorySummary: TripCategorySummary[];
}

/**
 * Trip with full expense details for detail view
 */
export interface TripDetail extends Trip {
  expenses: Transaction[];
  categorySummary: TripCategorySummary[];
  totalCents: number;
  expenseCount: number;
}

/**
 * Category history - transactions grouped by month
 */
export interface CategoryHistoryMonth {
  month: string; // "2025-01"
  totalCents: number;
  transactionCount: number;
  transactions: Transaction[];
}

/**
 * Category history - aggregated summary (calculated in SQL)
 */
export interface CategoryHistorySummary {
  totalCents: number;
  transactionCount: number;
  monthCount: number;
  averagePerMonthCents: number;
}

/**
 * Category history - full API response
 */
export interface CategoryHistoryResponse {
  category: Category;
  dateFrom: string;
  dateTo: string;
  summary: CategoryHistorySummary;
  months: CategoryHistoryMonth[];
}

// ============================================================
// FISCAL TYPES (Modelo 303 - IVA, Modelo 130 - IRPF)
// ============================================================

/**
 * Computed fiscal fields from computeFiscalFields()
 */
export interface FiscalComputedFields {
  baseCents: number;
  ivaCents: number;
  baseDeducibleCents: number;
  ivaDeducibleCents: number;
}

/**
 * Transaction with fiscal computed fields (from vw_FiscalQuarterly + computeFiscalFields)
 */
export interface FiscalTransaction extends FiscalComputedFields {
  transactionId: number;
  transactionDate: string;
  categoryName: string;
  parentCategoryName: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  companyTaxId: string | null;
  description: string | null;
  type: TransactionType;
  fullAmountCents: number;
  vatPercent: number;
  deductionPercent: number;
}

/**
 * Modelo 303 summary for one quarter (IVA)
 */
export interface Modelo303Summary {
  fiscalYear: number;
  fiscalQuarter: number;
  casilla07Cents: number; // Base imponible operaciones interiores (VatPercent > 0)
  casilla09Cents: number; // Cuota IVA devengado
  casilla27Cents: number; // Total IVA devengado
  casilla28Cents: number; // Base deducciones
  casilla29Cents: number; // Cuota IVA deducible
  casilla45Cents: number; // Total IVA deducible
  casilla120Cents: number; // Operaciones no sujetas por reglas de localización (VatPercent = 0)
  resultCents: number;
  /** Casilla 110: IVA a compensar carried into this quarter from earlier periods */
  vatPoolOpeningCents: number;
  /** Casilla 87 + what this quarter generates: the balance left after filing it */
  vatPoolClosingCents: number;
  /**
   * True when the pool can only ever grow: no output VAT this year, so nothing to compensate
   * it against. The only way out is asking for the refund in the fourth quarter.
   */
  vatPoolIsStranded: boolean;
}

/**
 * Modelo 130 summary for one quarter (IRPF, cumulative)
 */
export interface Modelo130Summary {
  fiscalYear: number;
  fiscalQuarter: number;
  casilla1Cents: number; // Cumulative income
  casilla2Cents: number; // Cumulative deductible expenses (documented + difícil justificación)
  casilla3Cents: number; // Profit (C01 - C02)
  casilla4Cents: number; // 20% of profit
  casilla5Cents: number; // Previous quarter payments
  casilla6Cents: number; // IRPF withheld by clients this year (reduces the amount to pay)
  casilla7Cents: number; // Amount to pay
  gastosDocumentadosCents: number; // Documented expenses subtotal
  /**
   * Amortization of the inmovilizado accrued from 1 January to the end of the quarter, already
   * inside casilla 02. Broken out because casilla 02 = documentados + amortización + difícil
   * justificación, and a breakdown that omitted it would not add up to the box above it.
   */
  amortizacionCents: number;
  gastosDificilCents: number; // 5% difficult-to-justify expenses (capped at 2000€/year)
  /** True when a previous quarter had no filed amount and casilla 05 fell back to a recomputation */
  casilla5IsEstimated: boolean;
}

/**
 * Modelo 390 summary (annual VAT - sum of 4 quarterly 303s)
 */
export interface Modelo390Summary {
  fiscalYear: number;
  casilla47Cents: number; // Total cuotas devengadas (sum of C27)
  casilla48Cents: number; // Total bases deducibles (sum of C28)
  casilla49Cents: number; // Total cuotas deducibles (sum of C29)
  casilla605Cents: number; // Base IVA deducible operaciones interiores 21%
  casilla606Cents: number; // Cuota IVA deducible 21%
  casilla64Cents: number; // Total deducciones (= C49)
  casilla65Cents: number; // Resultado (C47 - C64)
  casilla84Cents: number; // Suma resultados (= C65)
  casilla86Cents: number; // Resultado liquidación (= C84)
  casilla97Cents: number; // A compensar del ÚLTIMO periodo (lo que la AEAT cruza contra el 4T 303)
  casilla662Cents: number; // Cuotas a compensar generadas en los demás trimestres del año
  casilla110Cents: number; // Op. no sujetas por reglas de localización (sum of C120)
  casilla108Cents: number; // Total volumen operaciones (= C110)
}

/**
 * Modelo 100 — Economic activities section (Estimación Directa Simplificada)
 * Only covers the professional activities section; user completes the rest in Renta Web
 */
export interface Modelo100GastoCasilla {
  casilla: string;
  cents: number;
}

export interface Modelo100Section {
  fiscalYear: number;
  casilla0171Cents: number; // Ingresos de explotación
  casilla0180Cents: number; // Total ingresos computables (= C0171)
  casilla0218Cents: number; // Suma gastos deducibles (documented)
  casilla0221Cents: number; // Diferencia (C0180 - C0218)
  casilla0222Cents: number; // Gastos difícil justificación (5%, max 2000€)
  casilla0223Cents: number; // Total gastos deducibles (C0218 + C0222)
  casilla0224Cents: number; // Rendimiento neto (C0180 - C0223)
  gastosPorCasilla: Modelo100GastoCasilla[]; // Desglose de gastos por casilla AEAT
  /**
   * Deductible expenses whose category carries no casilla, already counted in the default one.
   * Surfaced because the breakdown would otherwise look complete: an unmapped category and a
   * deliberate "otros servicios exteriores" produce the same row.
   */
  unmappedCents: number;
}

/**
 * Full fiscal report for a year + quarter
 */
export interface FiscalReport {
  fiscalYear: number;
  fiscalQuarter: number;
  modelo303: Modelo303Summary;
  modelo130: Modelo130Summary;
  expenses: FiscalTransaction[];
  invoices: FiscalTransaction[];
  /** Income of the quarter that falls outside the professional category, so no model counts it */
  uncountedIncome: FiscalTransaction[];
}

/**
 * Full annual fiscal report (Modelo 390 + Modelo 100)
 */
export interface AnnualFiscalReport {
  fiscalYear: number;
  modelo390: Modelo390Summary;
  modelo100: Modelo100Section;
}

/**
 * One IRPF bracket: [upper limit in cents (Infinity for the last one), rate as a factor]
 */
export type IrpfScaleBracket = readonly [number, number];

export type IrpfScale = readonly IrpfScaleBracket[];

/**
 * IRPF provision: the gap between the flat 20% paid through Modelo 130 and the
 * progressive IRPF that the annual Renta will actually charge.
 * Estimación directa simplificada only. Every amount is in cents.
 */
export interface IrpfProjection {
  fiscalYear: number;
  region: IrpfRegion;
  /** Actuals so far this year (accrual basis) */
  ytdIncomeCents: number;
  ytdExpensesCents: number;
  /** Full-year figures: the caller's override, or a linear run-rate projection */
  projectedIncomeCents: number;
  projectedExpensesCents: number;
  /**
   * Dotación of the whole year (art. 30.2 RIRPF), already subtracted from projectedNetIncomeCents
   * and deliberately outside projectedExpensesCents: the schedule of an asset already spans every
   * day of the year, so this is the one figure the linear run-rate must never extrapolate.
   */
  amortizacionCents: number;
  gastosDificilCents: number; // 5% difícil justificación, capped
  projectedNetIncomeCents: number; // Rendimiento neto
  /** Pension contributions declared for the year, per bucket: each has its own legal ceiling */
  pensionIndividualCents: number;
  pensionEmploymentCents: number;
  /** What of them actually reduced the base after every cap (arts. 51-52); ≤ the sum of both buckets */
  pensionReductionCents: number;
  baseLiquidableCents: number; // Rendimiento neto minus the pension reduction — the base the scale taxes
  /** Modelo 130 already settled: the filed casilla 7 of the quarters whose deadline has passed */
  modelo130PaidCents: number;
  /** True when some settled quarter had no filed amount and was recomputed instead */
  modelo130PaidIsEstimated: boolean;
  modelo130RemainingCents: number;
  modelo130TotalCents: number; // 20% of the projected net income
  retencionesCents: number; // IRPF withheld by clients this year (casilla 06); already netted out of modelo130PaidCents
  estimatedIrpfCents: number; // Progressive scale (state + regional), minus the mínimo personal
  provisionGapCents: number; // estimatedIrpfCents - modelo130TotalCents
  marginalRate: number; // Factor (e.g. 0.43)
  monthlyProvisionCents: number; // estimatedIrpfCents / 12
  effectiveRate: number; // estimatedIrpfCents / projectedNetIncomeCents
  isProjectionReliable: boolean; // False when the run-rate rests on fewer than MIN_PROJECTION_DAYS elapsed days
}

/**
 * Annual fiscal profile: the per-year figures only the taxpayer knows, because they are
 * savings rather than income or expense and no transaction can carry them.
 * They reduce the base imponible general of the Renta and never touch Modelo 130.
 * Every amount is in cents.
 */
export interface FiscalProfile {
  fiscalYear: number;
  /** Plan de pensiones individual — general limit of art. 52.1.b) */
  pensionIndividualCents: number;
  /** Plan de empleo simplificado de trabajadores por cuenta propia — increment of art. 52.1.b) 2.º */
  pensionEmploymentCents: number;
  /** IVA a compensar carried into 1 January of this year (casilla 110 of its first 303) */
  vatPoolOpeningCents: number;
}

/**
 * Writable half of the annual fiscal profile: the year identifies the row, it is not stored data.
 * Every field is optional and an omitted one keeps its stored value — two different cards edit
 * this row (pension contributions, IVA pool) and neither may wipe the other's figure.
 */
export type FiscalProfileInput = Partial<Omit<FiscalProfile, 'fiscalYear'>>;

// ============================================================
// FIXED ASSETS (INMOVILIZADO)
// ============================================================

/**
 * A fixed asset whose cost is spread over its useful life instead of being deducted in full in
 * the year of purchase (art. 30.2 RIRPF + tabla de amortización simplificada, Orden de 27 de
 * marzo de 1998). Only the yearly dotación is deductible, and it feeds Modelo 100 casilla 0208
 * (material) or 0227 (intangible).
 *
 * The purchase itself stays where it belongs — a "Transactions" row for the money that actually
 * left the account. This record only says how that cost is spread; the dotación is never a
 * transaction (see the "FixedAssets" comment in database/schema.sql).
 */
export interface FixedAsset {
  assetId: number;
  description: string;
  /** Calendar day the asset entered service, 'YYYY-MM-DD'. Amortization accrues from here */
  inServiceDate: string;
  /** Amortizable base in cents: the acquisition cost net of any deductible VAT */
  baseCents: number;
  /**
   * The annual straight-line rate actually applied, stored rather than derived from the group.
   *
   * Three independent reasons, any one of which would be enough:
   * 1. The tabla gives a **maximum**. Amortising below it is legal and sometimes deliberate, so
   *    the rate is a taxpayer decision, not a function of the group.
   * 2. The ERD doubling of art. 103 LIS (AMORTIZATION.ERD_MULTIPLIER) only applies to elementos
   *    nuevos del inmovilizado material, which the group alone cannot tell.
   * 3. It must be frozen. The tabla is fixed by Orden and can change; a rate recomputed at read
   *    time would silently rewrite the dotación of years that have already been filed.
   */
  coefficientPercent: number;
  /**
   * Grupo of the tabla simplificada, or null when the rate does not come from it — a custom
   * coefficient (or libertad de amortización, art. 102 LIS) belongs to no group.
   */
  amortizationGroup: AmortizationGroupNumber | null;
  /** Modelo 100 box the dotación lands in: '0208' material, '0227' intangible */
  modelo100CasillaCode: AmortizationCasilla;
  /** The purchase transaction, when it is recorded. Null keeps an asset bought before BudgetGuard */
  transactionId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Writable half of a fixed asset, in cents — what the repository stores.
 * The route edge converts the euros that arrive on the wire (see src/schemas/fixed-asset.ts).
 */
export type FixedAssetInput = Omit<FixedAsset, 'assetId' | 'createdAt' | 'updatedAt'>;

/** Same, for a PATCH: an omitted field keeps its stored value. */
export type FixedAssetUpdateInput = Partial<FixedAssetInput>;

/**
 * An asset with its year-by-year table, as the schedule view renders it.
 * `years` comes from computeAmortizationSchedule() and its cents always sum to baseCents.
 */
export interface FixedAssetSchedule {
  asset: FixedAsset;
  years: AmortizationYear[];
}

// No per-year aggregate lives here on purpose: the dotación of a year is derived, never stored.
// The card folds its assets with computeAmortizationSchedule() and the fiscal models fold them with
// getAmortizationCentsForPeriod(); a third shape saying the same thing could only drift from them.

// ============================================================
// INVOICING TYPES
// ============================================================

/**
 * User billing profile (issuer data for invoices)
 */
export interface BillingProfile {
  billingProfileId: number;
  fullName: string;
  nif: string;
  address: string | null;
  phone: string | null;
  paymentMethod: PaymentMethod;
  bankName: string | null;
  iban: string | null;
  swift: string | null;
  bankAddress: string | null;
  defaultHourlyRateCents: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Invoice numbering prefix/series
 */
export interface InvoicePrefix {
  prefixId: number;
  prefix: string;
  nextNumber: number;
  description: string | null;
  companyId: number | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * Single line item in an invoice.
 * `title` + `subItems` are the structured rendering (bold concept + bulleted sub-items).
 * `description` is kept for legacy rows and as an optional free-form paragraph.
 * At least one of `title` or `description` is always present.
 */
export interface InvoiceLineItem {
  lineItemId: number;
  invoiceId: number;
  sortOrder: number;
  title: string | null;
  subItems: string[];
  description: string | null;
  hours: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

/**
 * Full invoice with line items (detail view)
 */
export interface Invoice {
  invoiceId: number;
  prefixId: number;
  invoiceNumber: string | null;
  /** Working title while the invoice is a draft and has no number. Internal only. */
  draftName: string | null;
  invoiceDate: string;
  companyId: number | null;
  transactionId: number | null;
  /** Taxable base: the sum of the line items */
  baseCents: number;
  vatPercent: number;
  vatCents: number;
  /** IRPF withheld by the client, only for Spanish business clients */
  retentionPercent: number;
  retentionCents: number;
  /** What the client pays: base + VAT - retention */
  totalCents: number;
  currency: string;
  status: InvoiceStatus;
  billerName: string;
  billerNif: string;
  billerAddress: string | null;
  billerPhone: string | null;
  billerPaymentMethod: PaymentMethod;
  billerBankName: string | null;
  billerIban: string | null;
  billerSwift: string | null;
  billerBankAddress: string | null;
  clientName: string;
  clientTradingName: string | null;
  clientTaxId: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientPostalCode: string | null;
  clientCountry: string | null;
  notes: string | null;
  invoiceLanguage: string | null;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Invoice summary for list view
 */
export interface InvoiceListItem {
  invoiceId: number;
  invoiceNumber: string | null;
  /** Shown in place of the number while the invoice is a draft */
  draftName: string | null;
  invoiceDate: string;
  clientName: string;
  clientTradingName: string | null;
  totalCents: number;
  currency: string;
  status: InvoiceStatus;
}

// ============================================================
// FISCAL DOCUMENTS & DEADLINES
// ============================================================

/**
 * Data extracted from a fiscal document via OCR (all amounts in cents)
 */
export interface ExtractedInvoiceData {
  totalAmountCents: number;
  baseAmountCents: number | null;
  taxAmountCents: number | null;
  vatPercent: number | null;
  date: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  confidence: number;
}

/**
 * Data detected from an AEAT modelo PDF via OCR (result amount in cents)
 */
export interface DetectedModeloData {
  modeloType: ModeloType | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  resultAmountCents: number | null;
  confidence: number;
}

/**
 * Uploaded fiscal document (modelo or received invoice)
 */
export interface FiscalDocument {
  documentId: number;
  documentType: FiscalDocumentType;
  modeloType: ModeloType | null;
  fiscalYear: number;
  fiscalQuarter: number | null;
  status: FiscalStatus;
  downloadUrl: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  taxAmountCents: number | null;
  transactionId: number | null;
  transactionGroupId: number | null;
  companyId: number | null;
  description: string | null;
  documentDate: string | null;
  vendorName: string | null;
  displayName: string;
  createdAt: string;
}

/**
 * AEAT deadline (computed server-side, NOT by the client)
 */
export interface FiscalDeadline {
  modeloType: ModeloType;
  fiscalYear: number;
  fiscalQuarter: number | null;
  startDate: string;
  /** Filing deadline, already moved to the next working day when the rule date was inhábil */
  endDate: string;
  /** The date the rule states, before any working-day extension */
  nominalEndDate: string;
  /** Last day to file with the payment direct-debited; null for models that do not admit it */
  domiciliacionEndDate: string | null;
  /** False while the Orden fixing this Renta campaign has not been published */
  isWindowConfirmed: boolean;
  status: FilingStatus;
  isFiled: boolean;
  daysRemaining: number | null;
  needsPostponement: boolean;
}

/**
 * User preferences for fiscal deadline reminders
 */
export interface FiscalDeadlineSettings {
  reminderDaysBefore: number;
  postponementReminder: boolean;
  isActive: boolean;
}
