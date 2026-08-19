/**
 * BudgetGuard Finance Types
 * All monetary amounts use cents (integers) internally to avoid floating point errors
 */

import type {
  AmortizationCasilla,
  AmortizationGroupNumber,
  BadDebtExclusion,
  BadDebtStage,
  BadDebtWaitingTerm,
  CompanyRole,
  CrossQuarterCase,
  DeferralCheck,
  DeferralPart,
  DeferralStatus,
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
  TransactionStatus,
  TransactionType,
} from '@/constants/finance';
import type { AmortizationYear } from '@/utils/amortization';

// Re-export from constants (single source of truth)
export type {
  AmortizationCasilla,
  AmortizationGroupNumber,
  BadDebtChecklistStep,
  BadDebtExclusion,
  BadDebtStage,
  BadDebtWaitingTerm,
  CompanyRole,
  CrossQuarterCase,
  CrossQuarterDataIntegrityCase,
  DateRangePreset,
  DeferralCheck,
  DeferralPart,
  DeferralStatus,
  FilingStatus,
  FiscalDocumentType,
  FiscalQuarter,
  FiscalStatus,
  InvoiceStatus,
  IrpfRegion,
  IrpfScale,
  IrpfScaleBracket,
  IrpfYearFigures,
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
  /** Default IRPF deduction share (art. 30.2.5.ª b LIRPF). */
  defaultDeductionPercent: number | null;
  /**
   * Default IVA deduction share (art. 95 LIVA), which the law does not let be the same number.
   *
   * Optional and nullable, and the two states mean different things: absent is "the read did not
   * ask for this column", null is "unset — the IVA share is whatever the IRPF share is".
   */
  defaultVatDeductionPercent?: number | null;
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
  /**
   * The IRPF deduction share, and only that. The supplies of a home partially affected to the
   * activity are deductible at 30% of the affected proportion (art. 30.2.5.ª b LIRPF).
   */
  deductionPercent: number | null;
  /**
   * The IVA deduction share. Art. 95 LIVA requires exclusive affectation for anything that is not
   * a bien de inversión, and AEAT holds that none of the input VAT on the supplies of a partially
   * affected dwelling is deductible (V2554-23, TEAC 6654/2022) — 0%, on the same receipt the IRPF
   * deducts a share of.
   *
   * Optional, like `deferralId`: an absent field means the read did not select the column, while
   * an explicit null means unset, and unset is `VAT_DEDUCTION_INHERITS_IRPF` — the IVA share
   * follows `deductionPercent`, which is what the app did before the column existed.
   */
  vatDeductionPercent?: number | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  companyId: number | null;
  fiscalDocumentId: number | null;
  voucherId: number | null;
  voucherUnits: number | null;
  /**
   * The aplazamiento this row is one piece of; null for every ordinary movement.
   *
   * Optional, like `category`: the general transaction reads do not select the deferral columns,
   * so an absent field means "not asked for" and an explicit null means "not part of a deferral".
   */
  deferralId?: number | null;
  /** Which fracción of that resolution (1..N of ANEXO I) */
  deferralFraccionNumber?: number | null;
  /** Which of the three parts of the fracción: only the interés is deductible */
  deferralPart?: DeferralPart | null;
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
  /** The IVA deduction share of every occurrence this rule generates. Null: follows the IRPF one. */
  vatDeductionPercent?: number | null;
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
  vatDeductionPercent?: number | null;
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
 * The year + quarter a date is settled in — the fiscal period, not the calendar one it
 * happens to sit in. Returned by getFiscalPeriod().
 */
export interface FiscalPeriod {
  year: number;
  quarter: FiscalQuarter;
}

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
  /**
   * The IRPF deduction share (art. 30.2.5.ª b LIRPF) — the one that shapes `baseDeducibleCents`.
   * Named without a prefix for historical reasons; `vatDeductionPercent` is its IVA counterpart.
   */
  deductionPercent: number;
  /**
   * The IVA deduction share (art. 95 LIVA) — the one that shapes `ivaDeducibleCents`. On the
   * supplies of a partially affected dwelling it is 0 % while the IRPF share above is 7,5 %
   * (V2554-23, TEAC 6654/2022), which is the whole reason the two travel separately.
   *
   * Optional only because a producer may not resolve it: absent means
   * `VAT_DEDUCTION_INHERITS_IRPF`, i.e. read `deductionPercent`. Both repository producers do
   * resolve it — the fiscal views apply the COALESCE — so it arrives present from the API.
   */
  vatDeductionPercent?: number;
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
  /**
   * Issued invoices whose devengo and whose cobro disagree about this quarter. Informational:
   * the figures above are already right, this only names where a bank statement would say
   * otherwise.
   */
  crossQuarterInvoices: CrossQuarterInvoice[];
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
  /**
   * False when the year has no published figures of its own and the scale, the mínimo personal
   * and the pension ceilings were carried forward from LAST_PUBLISHED_IRPF_YEAR.
   *
   * Not a variant of isProjectionReliable: that one is about how much of the year has elapsed
   * and improves on its own as days pass, this one is about whether the Ley de Presupuestos is
   * published and only changes when somebody adds the year to IRPF_YEAR_FIGURES. A year can be
   * fully elapsed and still unconfirmed, and vice versa.
   */
  isScaleConfirmed: boolean;
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

/**
 * A movement that looks like the purchase of an asset whose `transactionId` is null.
 *
 * It is a *suggestion*, never a link: only the user can confirm which movement bought the asset,
 * and the repository offers at most a handful (ASSET_PURCHASE_MATCH.MAX_CANDIDATES) so that the
 * choice stays recognisable. Everything a human needs to recognise the movement travels with it —
 * a candidate they cannot identify at a glance is one they should not link.
 */
export interface AssetPurchaseCandidate {
  transactionId: number;
  /** Calendar day the money left the account, 'YYYY-MM-DD' */
  transactionDate: string;
  description: string | null;
  vendorName: string | null;
  categoryName: string;
  /** What the movement cost, VAT included and un-halved for a shared expense */
  fullAmountCents: number;
  /**
   * The only figure comparable with `FixedAsset.baseCents`: the base plus whatever input VAT is
   * **not** deductible, because an amortizable base is the cost net of *deductible* VAT alone.
   */
  amortizableCostCents: number;
  /** How far that figure is from the asset's base, in cents. Zero is an exact match */
  amountDeltaCents: number;
  /** Days from the movement to the in-service date; negative when the movement is the later one */
  daysBeforeInService: number;
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

/**
 * An issued invoice whose devengo and whose cobro do not tell the same story about a quarter.
 *
 * Purely informational: the figure the models computed is the correct one in every case. This
 * exists because the person filing reasons from bank movements while the law reasons from the
 * invoice date, and when the two disagree the human is the one who gets it wrong.
 *
 * Carries both periods already resolved so the UI can explain itself without a second query.
 */
export interface CrossQuarterInvoice {
  invoiceId: number;
  /** Nullable to match the column: an issued invoice always has one, an un-numbered draft never does */
  invoiceNumber: string | null;
  clientName: string;
  /** What the client pays: base + IVA − retención */
  totalCents: number;
  /** Fecha de devengo — the date every fiscal model books this invoice on */
  invoiceDate: string;
  invoiceYear: number;
  invoiceQuarter: number;
  /** Date of the payment transaction; null when no collection is on record */
  collectionDate: string | null;
  collectionYear: number | null;
  collectionQuarter: number | null;
  crossQuarterCase: CrossQuarterCase;
  /** The two periods fall in different fiscal years, so they belong to two different Rentas */
  crossesFiscalYear: boolean;
}

// ============================================================
// CRÉDITOS INCOBRABLES (art. 80.Cuatro LIVA)
// ============================================================

/**
 * One term's window on one invoice: when the rectificativa may be issued, and until when.
 *
 * Both terms are always computed, because which one applies is the taxpayer's option
 * (art. 80.Cuatro.A).1.ª) and nothing in the data model records the choice. Presenting them as
 * two labelled alternatives is deliberate: see BAD_DEBT_WAITING_TERM on why the app must not
 * assume the second window survives the first.
 */
export interface BadDebtWindow {
  term: BadDebtWaitingTerm;
  /** 6 or 12 — BAD_DEBT_WAITING_TERM_MONTHS for this term */
  waitingMonths: number;
  /** devengo + waitingMonths: the first day the rectificativa may be issued */
  windowStartDate: string;
  /** windowStartDate + BAD_DEBT_RECTIFICATION_WINDOW_MONTHS. Caducidad: after it the right is gone */
  windowEndDate: string;
  stage: BadDebtStage;
  /** Days left before the window opens; null once it has opened */
  daysUntilWindowStart: number | null;
  /** Days left before the right lapses; null while waiting and once expired */
  daysRemainingInWindow: number | null;
}

/**
 * An uncollected issued invoice measured against art. 80.Cuatro, whether or not the article
 * reaches it.
 *
 * `exclusion` is the fail-closed gate: non-null means the clock does not run and `windows` is
 * empty. It is carried rather than dropped so the UI can answer *why this invoice is not here* —
 * for this user's portfolio (services to non-established businesses, casilla 120) that is the
 * expected answer for every invoice, and an empty module with no explanation reads as a bug.
 */
export interface BadDebtInvoice {
  invoiceId: number;
  invoiceNumber: string | null;
  clientName: string;
  /** The snapshot value the establishment gate was decided on; null closes the gate */
  clientCountry: string | null;
  /**
   * Proxy for the fecha de devengo. Services accrue when they are rendered (art. 75.Uno.2.º
   * LIVA) and the app stores no service date, so this is "InvoiceDate": exact for an invoice
   * issued the day the work ended, a few days out otherwise. The UI must say so.
   */
  accrualDate: string;
  baseCents: number;
  vatPercent: number;
  /** The cuota repercutida — what art. 80.Cuatro would let the user recover. Zero closes the gate */
  vatCents: number;
  totalCents: number;
  status: InvoiceStatus;
  /** Why the article does not reach this invoice; null when the clock runs */
  exclusion: BadDebtExclusion | null;
  /** One entry per term, shortest first. Empty whenever `exclusion` is non-null */
  windows: BadDebtWindow[];
  /** True when a window is open or opens within BAD_DEBT_APPROACHING_DAYS */
  needsAttention: boolean;
}

/**
 * The whole clock, as one payload: what is running and what was ruled out.
 *
 * The module generates no rectificativa, files no 952 and never changes an invoice's status. It
 * reports dates and what has to be done by them.
 */
export interface BadDebtReport {
  /** Computed against this day, 'YYYY-MM-DD' */
  asOfDate: string;
  /**
   * The invoices the gate lets through, lapsed windows included: once the right is gone the loss
   * stays on screen rather than disappearing. `needsAttention` is what marks the chaseable ones.
   */
  tracked: BadDebtInvoice[];
  /** Uncollected issued invoices the gate closed on, each carrying its `exclusion` */
  outOfScope: BadDebtInvoice[];
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
 * What a quarter's cross-quarter findings add to a deadline that is already due.
 *
 * A qualifier, never an obligation of its own: no new date is invented, and the figures the
 * models computed stay exactly as they are. It only reaches the user who is about to file the
 * 303 or the 130 of that quarter, saying how many invoices disagree with the bank statement and
 * for how much.
 */
export interface CrossQuarterDeadlineNote {
  fiscalYear: number;
  fiscalQuarter: number;
  /** Invoices in disagreement for this quarter, all cases counted */
  invoiceCount: number;
  /** Their total, in cents. What the user would be tempted to move between quarters */
  totalCents: number;
  /**
   * How many of those are the data-integrity case (CROSS_QUARTER_DATA_INTEGRITY_CASES): a broken
   * link to repair, not a timing disagreement. Kept apart because it needs its own wording.
   */
  dataIntegrityCount: number;
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
  /**
   * Cross-quarter qualifier for this filing. Optional because the deadline computation is pure
   * and knows nothing about invoices: it is attached afterwards, and only for the modelos and
   * statuses listed in CROSS_QUARTER_DEADLINE_MODELOS / CROSS_QUARTER_DEADLINE_FILING_STATUSES.
   */
  crossQuarter?: CrossQuarterDeadlineNote;
}

/**
 * User preferences for fiscal deadline reminders
 */
export interface FiscalDeadlineSettings {
  reminderDaysBefore: number;
  postponementReminder: boolean;
  isActive: boolean;
}

// ============================================================
// APLAZAMIENTOS / FRACCIONAMIENTOS (AEAT deferrals)
// ============================================================

/**
 * An AEAT "RESOLUCIÓN DE APLAZAMIENTO/FRACCIONAMIENTO": the header of the letter that splits a
 * filed modelo into dated instalments.
 *
 * The instalments themselves are `Transaction` rows pointing back here (see `deferralId`) — this
 * is only the document. `totalDeudaCents` is deliberately absent: it is the sum of the three
 * parts and a stored copy could only drift from them.
 */
export interface Deferral {
  deferralId: number;
  /** AEAT's own identifier for the resolution, e.g. '282640560363H' */
  expedienteNumber: string;
  /** The modelo being deferred — all three letters read so far are Modelo 130 */
  modeloType: ModeloType;
  fiscalYear: number;
  /** Null only for the annual modelos (390, 100), which carry no quarter */
  fiscalQuarter: FiscalQuarter | null;
  liquidacionNumber: string | null;
  /**
   * "Fecha de Intereses": the last day of the periodo voluntario, as printed.
   * Interest runs from the DAY AFTER it, which is why this is not called a start date.
   */
  interestStartDate: string;
  /** Interés de demora of the resolution, e.g. 4.062 */
  interestRatePercent: number;
  /** The tax being deferred. Not an expense: it is the IVA or the IRPF itself */
  principalCents: number;
  /** Recargo de apremio — its own figure, never folded into the principal. NOT deductible */
  surchargeCents: number;
  /** Intereses de demora — the only deductible part, as a gasto financiero (casilla 0203) */
  interestCents: number;
  /** The archived letter in `FiscalDocuments`; null while it has not been uploaded */
  fiscalDocumentId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Writable half of a deferral — what the repository stores. Amounts already in cents. */
export type DeferralInput = Omit<Deferral, 'deferralId' | 'createdAt' | 'updatedAt'>;

/** Same, for a partial update: an omitted field keeps its stored value. */
export type DeferralUpdateInput = Partial<DeferralInput>;

/**
 * One row of ANEXO I: what a single fracción costs and when it falls due.
 *
 * **Read from the letter, never derived.** AEAT does not keep the principal constant across the
 * fracciones: it loads the rounding remainder onto the last one (781,66 ×5 then 781,69; 489,17 ×3
 * then 489,20). Splitting the total evenly is off by up to three cents per instalment, which is
 * exactly the error this module exists to stop.
 */
export interface DeferralFraccion {
  /** 1..N, in the order ANEXO I prints them */
  fraccionNumber: number;
  principalCents: number;
  /** Recargo de apremio of this fracción. Zero on all three sample letters, 1.346,57 € on an earlier one */
  surchargeCents: number;
  interestCents: number;
  /** "Total del plazo" as printed: principal + recargo + interés. Kept to be checked, not to be trusted blindly */
  totalCents: number;
  /** "Fecha de vencimiento", 'YYYY-MM-DD' */
  dueDate: string;
}

/** The three parts of a deferral plus their sum — the shape of both a header and a column total. */
export interface DeferralTotals {
  principalCents: number;
  surchargeCents: number;
  interestCents: number;
  /** principal + recargo + interés. Always derived, never stored */
  totalCents: number;
}

/**
 * What Claude Vision returns for one resolution letter.
 *
 * Every field is nullable because a document can be unreadable in one corner and perfect in the
 * rest, and a null is information the confirm screen can act on. The reader works from the
 * RENDERED page: a PDF text layer prints each AEAT label two lines away from its own value, and
 * that mangling has already produced a misreading in this project.
 */
export interface ExtractedDeferralData {
  expedienteNumber: string | null;
  modeloType: ModeloType | null;
  fiscalYear: number | null;
  fiscalQuarter: FiscalQuarter | null;
  liquidacionNumber: string | null;
  /** "Fecha de Intereses" exactly as printed, 'YYYY-MM-DD' */
  interestStartDate: string | null;
  interestRatePercent: number | null;
  /** Totals row of ANEXO I, as printed */
  principalCents: number | null;
  surchargeCents: number | null;
  interestCents: number | null;
  /** One entry per fracción, in printed order. Empty when the table could not be read at all */
  fracciones: DeferralFraccion[];
  /** 0..1, the extractor's own confidence — compare against LOW/HIGH_CONFIDENCE_THRESHOLD */
  confidence: number;
}

/** A single disagreement found while checking a letter against itself. */
export interface DeferralVerificationIssue {
  check: DeferralCheck;
  /** The fracción the issue belongs to; null when it is about the resolution as a whole */
  fraccionNumber: number | null;
  /** Figure the letter states. Cents for the money checks, a count or a day index otherwise */
  expected: number;
  /** Figure its own rows add up to */
  actual: number;
  /** actual − expected. Signed on purpose: which way it is off says which figure was misread */
  difference: number;
}

/**
 * The verdict on an extracted resolution: does the letter agree with itself?
 *
 * Nothing here recomputes an amount from the interest rate. The whole check is
 * `sum(ANEXO I rows) === totals row`, which is the one comparison the document itself
 * guarantees — and the one that catches an OCR misread of a single digit.
 */
export interface DeferralVerdict {
  /** True when `issues` is empty: every total reconciles and the fracciones are well formed */
  isValid: boolean;
  /** The totals row of ANEXO I, as printed */
  declaredTotals: DeferralTotals;
  /** The same totals obtained by adding the fracciones one by one */
  computedTotals: DeferralTotals;
  issues: DeferralVerificationIssue[];
}

/**
 * One fracción seen through its movements: what it costs, when it falls due, and where it stands.
 *
 * The three parts of a fracción are three transactions and can in principle disagree, so the
 * status is resolved rather than read: **pending** if any movement is still pending (there is
 * something left to cancel), **paid** if none is pending and at least one was paid, **cancelled**
 * only when every movement is cancelled.
 */
export interface DeferralFraccionMovements {
  fraccionNumber: number;
  dueDate: string;
  /** The three parts and their sum, as booked */
  totals: DeferralTotals;
  status: TransactionStatus;
  /** The transactions this fracción is made of, one per DEFERRAL_PART */
  movementIds: number[];
}

/**
 * What cancelling a resolution would do, before anything is written.
 *
 * The confirmation has to show both halves: a deferral is cancelled in the middle of its
 * calendar, so what is kept is as important as what goes. Nothing here is destructive — the
 * pending movements become TRANSACTION_STATUS.CANCELLED and the paid ones are not touched at
 * all, because that money really did move.
 */
export interface DeferralCancellationPreview {
  deferralId: number;
  expedienteNumber: string;
  /** Derived state as it stands now, before cancelling */
  status: DeferralStatus;
  /** Fracciones with pending movements: these are what the cancellation would cancel */
  toCancel: DeferralFraccionMovements[];
  toCancelTotals: DeferralTotals;
  /** Fracciones already paid, or already cancelled: left exactly as they are */
  toKeep: DeferralFraccionMovements[];
  toKeepTotals: DeferralTotals;
}

/** What the cancellation actually did — the same two halves, after the write. */
export interface DeferralCancellationResult {
  deferralId: number;
  /** Derived again from the movements, so it reflects what was written and not what was intended */
  status: DeferralStatus;
  cancelledFraccionNumbers: number[];
  cancelledMovementCount: number;
  cancelledTotals: DeferralTotals;
  keptMovementCount: number;
  keptTotals: DeferralTotals;
}
