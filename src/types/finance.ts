/**
 * BudgetGuard Finance Types
 * All monetary amounts use cents (integers) internally to avoid floating point errors
 */

import type {
  CompanyRole,
  FilingStatus,
  FiscalDocumentType,
  FiscalStatus,
  InvoiceStatus,
  ModeloType,
  OccurrenceStatus,
  PaymentMethod,
  RecurringFrequency,
  TransactionType,
} from '@/constants/finance';

// Re-export from constants (single source of truth)
export type {
  CompanyRole,
  DateRangePreset,
  FilingStatus,
  FiscalDocumentType,
  FiscalQuarter,
  FiscalStatus,
  InvoiceStatus,
  ModeloType,
  OccurrenceStatus,
  PaymentMethod,
  RecurringFrequency,
  TransactionType,
  VatRate,
} from '@/constants/finance';

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
  startDate: string | null;
  endDate: string | null;
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
  casilla60Cents: number; // Exportaciones / operaciones exentas con derecho a deducción (VatPercent = 0)
  resultCents: number;
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
  casilla7Cents: number; // Amount to pay
  gastosDocumentadosCents: number; // Documented expenses subtotal
  gastosDificilCents: number; // 5% difficult-to-justify expenses (capped at 2000€/year)
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
  casilla97Cents: number; // A compensar (abs(C86) if negative, else 0)
  casilla104Cents: number; // Exportaciones/exentas con deducción (sum of C60)
  casilla108Cents: number; // Total volumen operaciones (= C104)
}

/**
 * Modelo 100 — Economic activities section (Estimación Directa Simplificada)
 * Only covers the professional activities section; user completes the rest in Renta Web
 */
export interface Modelo100Section {
  fiscalYear: number;
  casilla0171Cents: number; // Ingresos de explotación
  casilla0180Cents: number; // Total ingresos computables (= C0171)
  casilla0218Cents: number; // Suma gastos deducibles (documented)
  casilla0221Cents: number; // Diferencia (C0180 - C0218)
  casilla0222Cents: number; // Gastos difícil justificación (5%, max 2000€)
  casilla0223Cents: number; // Total gastos deducibles (C0218 + C0222)
  casilla0224Cents: number; // Rendimiento neto (C0180 - C0223)
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
}

/**
 * Full annual fiscal report (Modelo 390 + Modelo 100)
 */
export interface AnnualFiscalReport {
  fiscalYear: number;
  modelo390: Modelo390Summary;
  modelo100: Modelo100Section;
}

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
 * Single line item in an invoice
 */
export interface InvoiceLineItem {
  lineItemId: number;
  invoiceId: number;
  sortOrder: number;
  description: string;
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
  invoiceNumber: string;
  invoiceDate: string;
  companyId: number | null;
  transactionId: number | null;
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
  invoiceNumber: string;
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
  endDate: string;
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
