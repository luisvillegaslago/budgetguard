/**
 * BudgetGuard Finance Constants
 * Single source of truth for transaction types, query keys, and cache times
 */

// Transaction Types
export const TRANSACTION_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE];

// Filter Types (includes 'all' for UI filtering)
export const FILTER_TYPE = {
  ALL: 'all',
  ...TRANSACTION_TYPE,
} as const;

export type FilterType = (typeof FILTER_TYPE)[keyof typeof FILTER_TYPE];

// Transaction Status
export const TRANSACTION_STATUS = {
  PAID: 'paid',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
} as const;

export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

// Transaction Status Filter (includes 'all' for UI filtering)
export const STATUS_FILTER = {
  ALL: 'all',
  ...TRANSACTION_STATUS,
} as const;

export type StatusFilter = (typeof STATUS_FILTER)[keyof typeof STATUS_FILTER];

// Sort direction for sortable lists and tables
export const SORT_DIRECTION = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortDirection = (typeof SORT_DIRECTION)[keyof typeof SORT_DIRECTION];

// Shared Expense Configuration
export const SHARED_EXPENSE = {
  DIVISOR: 2,
  DEFAULT_DIVISOR: 1,
} as const;

// Voucher ("bono") derived status — computed from remaining balance, not stored
export const VOUCHER_STATUS = {
  ACTIVE: 'active',
  DEPLETED: 'depleted',
} as const;

export type VoucherStatus = (typeof VOUCHER_STATUS)[keyof typeof VOUCHER_STATUS];

// Balance Card Variants
export const CARD_VARIANT = {
  INCOME: 'income',
  EXPENSE: 'expense',
  BALANCE: 'balance',
} as const;

export type CardVariant = (typeof CARD_VARIANT)[keyof typeof CARD_VARIANT];

// Tab Bar Variants
export const TAB_BAR_VARIANT = {
  UNDERLINE: 'underline',
  PILLS: 'pills',
  PILLS_PRIMARY: 'pills-primary',
} as const;

export type TabBarVariant = (typeof TAB_BAR_VARIANT)[keyof typeof TAB_BAR_VARIANT];

// Recurring Expense Frequencies
export const RECURRING_FREQUENCY = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCY)[keyof typeof RECURRING_FREQUENCY];

// Recurring Expense End Conditions
export const END_CONDITION = {
  NEVER: 'never',
  AFTER_OCCURRENCES: 'after_occurrences',
  ON_DATE: 'on_date',
} as const;

export type EndCondition = (typeof END_CONDITION)[keyof typeof END_CONDITION];

// Occurrence Statuses
export const OCCURRENCE_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SKIPPED: 'skipped',
} as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUS)[keyof typeof OCCURRENCE_STATUS];

// TanStack Query Keys
export const QUERY_KEY = {
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  SUMMARY: 'summary',
  SUMMARY_TRENDS: 'summary-trends',
  CATEGORY_TRENDS: 'category-trends',
  SUBCATEGORY_SUMMARY: 'subcategory-summary',
  RECURRING_EXPENSES: 'recurring-expenses',
  PENDING_OCCURRENCES: 'pending-occurrences',
  TRANSACTION_GROUPS: 'transaction-groups',
  TRIPS: 'trips',
  TRIP_CATEGORIES: 'trip-categories',
  CATEGORY_HISTORY: 'category-history',
  FISCAL_REPORT: 'fiscal-report',
  FISCAL_ANNUAL: 'fiscal-annual',
  IRPF_PROJECTION: 'irpf-projection',
  VERSION: 'version',
  SYNC_COMPARE: 'sync-compare',
  SKYDIVE_JUMPS: 'skydive-jumps',
  SKYDIVE_DROPZONES: 'skydive-dropzones',
  TUNNEL_SESSIONS: 'tunnel-sessions',
  TUNNEL_LOCATIONS: 'tunnel-locations',
  SKYDIVE_STATS: 'skydive-stats',
  SKYDIVE_CATEGORIES: 'skydive-categories',
  VOUCHERS: 'vouchers',
  COMPANIES: 'companies',
  INVOICES: 'invoices',
  INVOICE_PREFIXES: 'invoice-prefixes',
  BILLING_PROFILE: 'billing-profile',
  FISCAL_DOCUMENTS: 'fiscal-documents',
  FISCAL_DEADLINES: 'fiscal-deadlines',
  FISCAL_DEADLINE_SETTINGS: 'fiscal-deadline-settings',
  FISCAL_PROFILE: 'fiscal-profile',
  FIXED_ASSETS: 'fixed-assets',
  DEFERRALS: 'deferrals',
  BAD_DEBT_INVOICES: 'bad-debt-invoices',
  CRYPTO_CREDENTIALS: 'crypto-credentials',
  CRYPTO_SYNC_STATUS: 'crypto-sync-status',
  CRYPTO_EVENTS: 'crypto-events',
  CRYPTO_ASSETS: 'crypto-assets',
  CRYPTO_DISPOSALS: 'crypto-disposals',
  CRYPTO_MODELO: 'crypto-modelo',
  CRYPTO_KLINES: 'crypto-klines',
  CRYPTO_PAIRS: 'crypto-pairs',
  CRYPTO_PAIR: 'crypto-pair',
  CRYPTO_TICKER: 'crypto-ticker',
} as const;

// Cache Times (in milliseconds)
export const CACHE_TIME = {
  NO_CACHE: 0,
  ONE_MINUTE: 1 * 60 * 1000,
  TWO_MINUTES: 2 * 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  FOREVER: Infinity,
} as const;

// Database Pool Configuration
export const DB_POOL = {
  MAX_CONNECTIONS: 10,
  MAX_CONNECTIONS_BACKUP: 5,
  IDLE_TIMEOUT_MS: 30_000,
} as const;

// API Endpoints
export const API_ENDPOINT = {
  CATEGORIES: '/api/categories',
  TRANSACTIONS: '/api/transactions',
  SUMMARY: '/api/summary',
  SUMMARY_TRENDS: '/api/summary/trends',
  CATEGORY_TRENDS: '/api/summary/category-trends',
  SUBCATEGORY_SUMMARY: '/api/summary/subcategories',
  RECURRING_EXPENSES: '/api/recurring-expenses',
  TRANSACTION_GROUPS: '/api/transaction-groups',
  TRIPS: '/api/trips',
  CATEGORY_HISTORY: '/api/categories',
  FISCAL: '/api/fiscal',
  FISCAL_ANNUAL: '/api/fiscal/annual',
  FISCAL_PROJECTION: '/api/fiscal/projection',
  VERSION: '/api/version',
  SYNC_COMPARE: '/api/sync/compare',
  SYNC_EXECUTE: '/api/sync/execute',
  SKYDIVE_JUMPS: '/api/skydiving/jumps',
  SKYDIVE_DROPZONES: '/api/skydiving/jumps/dropzones',
  TUNNEL_SESSIONS: '/api/skydiving/tunnel',
  TUNNEL_LOCATIONS: '/api/skydiving/tunnel/locations',
  SKYDIVE_STATS: '/api/skydiving/stats',
  SKYDIVE_CATEGORIES: '/api/skydiving/categories',
  SKYDIVE_RECONCILE: '/api/skydiving/reconcile-voucher',
  VOUCHERS: '/api/vouchers',
  COMPANIES: '/api/companies',
  INVOICES: '/api/invoices',
  INVOICE_PREFIXES: '/api/invoices/prefixes',
  BILLING_PROFILE: '/api/billing-profile',
  FISCAL_DOCUMENTS: '/api/fiscal/documents',
  FISCAL_DEADLINES: '/api/fiscal/deadlines',
  FISCAL_DEADLINE_SETTINGS: '/api/fiscal/deadlines/settings',
  FISCAL_PROFILE: '/api/fiscal/profile',
  FIXED_ASSETS: '/api/fiscal/assets',
  DEFERRALS: '/api/fiscal/deferrals',
  DEFERRALS_EXTRACT: '/api/fiscal/deferrals/extract',
  FISCAL_BAD_DEBT: '/api/fiscal/bad-debt',
  CRYPTO_CREDENTIALS: '/api/crypto/credentials',
  CRYPTO_CREDENTIALS_STATUS: '/api/crypto/credentials/status',
  CRYPTO_SYNC: '/api/crypto/sync',
  CRYPTO_EVENTS: '/api/crypto/events',
  CRYPTO_ASSETS: '/api/crypto/assets',
  CRYPTO_TAXABLE_EVENTS: '/api/crypto/taxable-events',
  CRYPTO_NORMALIZE: '/api/crypto/normalize',
  CRYPTO_FISCAL_MODELO: '/api/crypto/fiscal/modelo100',
  CRYPTO_FISCAL_RECOMPUTE: '/api/crypto/fiscal/recompute',
  CRYPTO_FISCAL_DISPOSALS: '/api/crypto/fiscal/disposals',
  CRYPTO_FISCAL_EXPORT: '/api/crypto/fiscal/export',
  CRYPTO_IMPORT_CSV: '/api/crypto/import/csv',
  CRYPTO_KLINES: '/api/crypto/klines',
  CRYPTO_PAIRS: '/api/crypto/pairs',
  CRYPTO_TICKER: '/api/crypto/ticker',
} as const;

// Trip Status
export const TRIP_STATUS = {
  UPCOMING: 'upcoming',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

// Trip default color (matches guard-trip in Tailwind config)
export const TRIP_COLOR = '#8B5CF6' as const;

// Well-known Skydiving Category Reference
export const SKYDIVE_CATEGORY = {
  NAME: 'Paracaidismo',
  ICON: 'cloud',
  COLOR: '#84CC16',
  SUBCATEGORY: {
    TUNNEL: 'Túnel de viento',
    JUMPS: 'Saltos',
  },
} as const;

// Skydiving activity kinds — a jump (SkydiveJumps) or a tunnel session (TunnelSessions)
export const SKYDIVE_ACTIVITY_TYPE = {
  JUMP: 'jump',
  TUNNEL: 'tunnel',
} as const;

// Outcome of reconciling a voucher consumption transaction to a skydiving activity
export const RECONCILE_ACTION = {
  LINKED: 'linked',
  CREATED: 'created',
  ALREADY_LINKED: 'already_linked',
} as const;

// Why a vision/OCR call failed — the provider's fault, never ours
export const VISION_FAILURE = {
  CREDITS_EXHAUSTED: 'credits_exhausted',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
  INVALID_RESPONSE: 'invalid_response',
} as const;

export type VisionFailureReason = (typeof VISION_FAILURE)[keyof typeof VISION_FAILURE];

// Wire codes the OCR endpoints return on a provider failure — the upload UI
// maps each one to its own message, so they are not plain i18n keys
export const OCR_ERROR_CODE = {
  API_CREDITS_EXHAUSTED: 'api_credits_exhausted',
  UNRECOGNIZABLE_AMOUNT: 'unrecognizable_amount',
} as const;

// Well-known Bank Fee Subcategory (under "Trabajo")
// Used when marking an invoice as paid with a bank transfer fee — auto-creates
// a 100% deductible expense for fiscal reporting (Modelo 130 / Modelo 100).
export const BANK_FEE_CATEGORY = {
  PARENT_NAME: 'Trabajo',
  SUBCATEGORY_NAME: 'Comisiones bancarias',
  ICON: 'landmark',
  COLOR: '#F59E0B',
  SORT_ORDER: 6,
  DEDUCTION_PERCENT: 100,
} as const;

// Trend chart period presets (dashboard cash-flow + cumulative charts)
export const TREND_PERIOD = {
  ONE_YEAR: '1y',
  FIVE_YEARS: '5y',
  TEN_YEARS: '10y',
  ALL: 'all',
} as const;

export type TrendPeriod = (typeof TREND_PERIOD)[keyof typeof TREND_PERIOD];

// Sentinel for the "all time" trend range — resolved server-side to the earliest
// month with activity. Shared by the trends endpoints and the chart hooks.
export const TREND_ALL_SENTINEL = 'all';
// Default trailing range (months) when no fromMonth is given.
export const TREND_DEFAULT_RANGE_MONTHS = 11;

// Alert panels shown at the top of the dashboard and the movements page.
// The id identifies the panel in the per-session dismiss state (see useFinanceStore).
export const ALERT_PANEL = {
  PENDING_TRANSACTIONS: 'pending-transactions',
  FISCAL_DEADLINES: 'fiscal-deadlines',
  RECURRING_PENDING: 'recurring-pending',
} as const;

export type AlertPanelId = (typeof ALERT_PANEL)[keyof typeof ALERT_PANEL];

// Visual severity of an alert panel
export const ALERT_TONE = {
  WARNING: 'warning',
  DANGER: 'danger',
} as const;

export type AlertTone = (typeof ALERT_TONE)[keyof typeof ALERT_TONE];

// Date Range Presets (for category history)
export const DATE_RANGE_PRESET = {
  THREE_MONTHS: '3m',
  SIX_MONTHS: '6m',
  ONE_YEAR: '1y',
  ALL: 'all',
} as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESET)[keyof typeof DATE_RANGE_PRESET];

// Spanish VAT rates.
// EXEMPT (0) is used for anything that carries no VAT. On issued invoices that means
// services located outside Spain (art. 69.Uno.1º Ley 37/1992), which are strictly
// "no sujetas" rather than exempt, and land in box [120] of Modelo 303.
export const VAT_RATE = {
  EXEMPT: 0,
  SUPER_REDUCED: 4,
  REDUCED: 10,
  STANDARD: 21,
} as const;

export type VatRate = (typeof VAT_RATE)[keyof typeof VAT_RATE];

// ── The two deduction shares of one expense ──
//
// A coded expense carries TWO percentages, and they answer to two different articles:
//
//   "DeductionPercent"    — the IRPF share. The supplies of a home partially affected to the
//                           activity are deductible at 30% of the affected proportion
//                           (art. 30.2.5.ª b LIRPF): with a 25% affectation of 102 m² declared in
//                           the modelo 036, 30% × 25% = 7,5%.
//   "VatDeductionPercent" — the IVA share. Art. 95 LIVA requires exclusive affectation for
//                           anything that is not a bien de inversión, and AEAT's position on the
//                           supplies of a partially affected dwelling (consulta V2554-23, TEAC
//                           6654/2022) is that NONE of that input VAT is deductible: 0%.
//
// So 7,5 and 0 on the same receipt. One field could not say both, and while there was one the app
// deducted input VAT a comprobación would disallow — and zeroing that single field to fix it would
// have erased 150,82 € of already filed input VAT (see docs/FISCAL_DOMAIN.md, § Amortización).

/**
 * An unset "VatDeductionPercent": the IVA share is whatever the IRPF share is.
 *
 * NOT 0. This is the fallback that makes the column inert on every row written before it existed,
 * and it is the reason adding it moved no figure in any filed modelo. "vw_FiscalQuarterly"
 * resolves it with a COALESCE onto "DeductionPercent", so nothing downstream has to remember it.
 */
export const VAT_DEDUCTION_INHERITS_IRPF = null;

/**
 * The two values art. 95 LIVA actually leaves available for a non-bien-de-inversión expense.
 *
 * A percentage in between is only meaningful for a bien de inversión (art. 95.Tres LIVA), so these
 * are named points on the scale rather than an enum the field is validated against — the column
 * takes any 0-100 share.
 */
export const VAT_DEDUCTION_PERCENT = {
  /** No exclusive affectation, no deduction. Home-office supplies land here. */
  NONE: 0,
  /** Exclusively affected to the activity. */
  FULL: 100,
} as const;

// Fiscal quarters
export const FISCAL_QUARTER = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
} as const;

export type FiscalQuarter = (typeof FISCAL_QUARTER)[keyof typeof FISCAL_QUARTER];

// IRPF rate for Modelo 130
export const IRPF_RATE = 20 as const;

// Professional income category — only this category counts as fiscal income in models 303/130/390/100
export const PROFESSIONAL_INCOME_CATEGORY = 'Facturas' as const;

// Gastos de difícil justificación (Estimación Directa Simplificada)
export const GASTOS_DIFICIL = {
  RATE: 5, // 5% of net income
  MAX_CENTS: 200_000, // 2,000€ annual cap
} as const;

// ── IRPF provision (Modelo 130 vs. the real progressive tax) ──

/**
 * IRPF progressive scale, state half (2026).
 * Tuples of [upperLimitCents, rate]; the last bracket has no upper limit.
 */
export const IRPF_STATE_SCALE = [
  [1_245_000, 0.095],
  [2_020_000, 0.12],
  [3_520_000, 0.15],
  [6_000_000, 0.185],
  [30_000_000, 0.225],
  [Number.POSITIVE_INFINITY, 0.245],
] as const;

/** Autonomous regions with their own IRPF scale. */
export const IRPF_REGION = {
  MADRID: 'madrid',
} as const;

export type IrpfRegion = (typeof IRPF_REGION)[keyof typeof IRPF_REGION];

/**
 * IRPF progressive scale, regional half (2026).
 * Extensible by region: only Madrid is supported today — add a new entry to IRPF_REGION
 * and its bracket table here to support another comunidad autónoma.
 */
export const IRPF_REGIONAL_SCALE = {
  [IRPF_REGION.MADRID]: [
    [1_336_222, 0.085],
    [1_900_463, 0.107],
    [3_542_568, 0.128],
    [5_732_040, 0.174],
    [Number.POSITIVE_INFINITY, 0.205],
  ],
} as const;

export const DEFAULT_IRPF_REGION: IrpfRegion = IRPF_REGION.MADRID;

/** Mínimo personal del contribuyente (5.550 €). Taxed by the scale and then subtracted as a quota. */
export const MINIMO_PERSONAL_CENTS = 555_000;

/**
 * Pension plan contributions that reduce the base imponible general (arts. 51-52 Ley 35/2006).
 *
 * Tax years 2025 and 2026: art. 52.1 as worded by Ley 31/2022, in force since 01-01-2023 and
 * unchanged for 2026 (no PGE 2026; the 2023 figures were prorrogadas).
 *
 * The two ceilings are kept apart on purpose: the general limit covers any plan (an individual
 * one included), while the increment is reserved for planes de empleo simplificados de
 * trabajadores por cuenta propia. A single joint ceiling could not tell 1.500 + 4.250 (legal)
 * from 5.750 in an individual plan (illegal).
 */
export const PENSION_PLAN = {
  /** Art. 52.1.b): general limit, 1.500 €/year, in cents */
  GENERAL_LIMIT_CENTS: 150_000,
  /** Art. 52.1.b) 2.º: increment for the self-employed, 4.250 €/year on top of the general one, in cents */
  SELF_EMPLOYED_EXTRA_CENTS: 425_000,
  /** Art. 52.1.a): 30% of the rendimientos netos del trabajo y de actividades económicas, as a factor */
  INCOME_PERCENTAGE_CAP: 0.3,
  /** Sanity ceiling for the amount typed per bucket, in euros — no bucket can legally come near it. */
  MAX_CONTRIBUTION_EUROS: 100_000,
} as const;

/** Modelo 130 pays a flat rate on the accumulated net income — the same IRPF_RATE, as a factor. */
export const IRPF_PROJECTION = {
  M130_RATE: IRPF_RATE / 100,
  /** Run-rate on fewer elapsed days is noise, not a projection. */
  MIN_PROJECTION_DAYS: 30,
  /** Sanity ceiling for the manual annual billing override, in euros. */
  MAX_INCOME_EUROS: 100_000_000,
} as const;

/**
 * Modelo 100 — every casilla of "Gastos fiscalmente deducibles" for rendimientos de actividades
 * económicas en estimación directa. A code that is not here cannot be assigned to a category.
 *
 * The whole set is listed even though a one-person professional can never use most of it.
 *
 * SOURCES, and why there are two. The bulk comes from the official form (ANEXO I,
 * BOE-A-2024-5721, ejercicio 2023). That form has no 0196 — but the filed Renta of ejercicio
 * 2025 does, as "Regularización cuotas RETA (si resulta cantidad a ingresar)", and its casilla
 * 218 sums it. AEAT added the box once the RETA regularisations by real income started arriving.
 *
 * So the numbering is not stable across campaigns, and an older form is evidence of what existed
 * then, never of what exists now. Before removing a box because some form lacks it, check a filed
 * modelo of the campaign in question — that is the only authority for the year being filed.
 */
export const MODELO_100_CASILLA = {
  C0181: '0181', // Compra de existencias
  C0182: '0182', // Variación de existencias (disminución de existencias finales)
  C0183: '0183', // Otros consumos de explotación
  C0184: '0184', // Sueldos y salarios
  C0185: '0185', // Seguridad Social a cargo de la empresa
  C0186: '0186', // Seguridad Social del titular de la actividad
  C0187: '0187', // Indemnizaciones
  C0188: '0188', // Dietas y asignaciones de viajes del personal empleado
  C0189: '0189', // Aportaciones a sistemas de previsión social imputadas al personal empleado
  C0190: '0190', // Otros gastos de personal
  C0191: '0191', // Gastos de manutención del contribuyente (art. 30.2.5ª.c LIRPF)
  C0192: '0192', // Arrendamientos y cánones
  C0193: '0193', // Reparaciones y conservación
  C0194: '0194', // Suministros (electricidad, agua, gas, telefonía e internet)
  C0195: '0195', // Aportaciones a mutualidades alternativas del titular de la actividad
  C0196: '0196', // Regularización cuotas RETA (si resulta cantidad a ingresar) — desde ejercicio 2025
  C0198: '0198', // Otros suministros
  C0199: '0199', // Servicios de profesionales independientes
  C0200: '0200', // Primas de seguros
  C0202: '0202', // Otros servicios exteriores
  C0203: '0203', // Gastos financieros
  C0205: '0205', // IVA soportado (recargo de equivalencia, compensación agricultura)
  C0206: '0206', // Otros tributos fiscalmente deducibles
  C0208: '0208', // Dotaciones del ejercicio para amortización de inmovilizado material
  C0214: '0214', // Pérdidas por insolvencias de deudores
  C0215: '0215', // Incentivos al mecenazgo. Convenios de colaboración
  C0216: '0216', // Incentivos al mecenazgo. Gastos en actividades de interés general
  C0217: '0217', // Otros conceptos fiscalmente deducibles (excepto provisiones)
  C0227: '0227', // Dotaciones del ejercicio para amortización del inmovilizado intangible
} as const;

export type Modelo100Casilla = (typeof MODELO_100_CASILLA)[keyof typeof MODELO_100_CASILLA];

/**
 * The subset offered when assigning a casilla to a category, in form order.
 *
 * Everything left out belongs to a business with employees, stock or patronage agreements — a
 * picker of 28 boxes where 13 can never apply hides the ones that can. The excluded codes stay
 * valid in `MODELO_100_CASILLA`, so a category that already carries one keeps working.
 */
export const MODELO_100_CASILLA_OPTIONS = [
  MODELO_100_CASILLA.C0183,
  MODELO_100_CASILLA.C0186,
  MODELO_100_CASILLA.C0191,
  MODELO_100_CASILLA.C0192,
  MODELO_100_CASILLA.C0193,
  MODELO_100_CASILLA.C0194,
  MODELO_100_CASILLA.C0195,
  MODELO_100_CASILLA.C0196,
  MODELO_100_CASILLA.C0198,
  MODELO_100_CASILLA.C0199,
  MODELO_100_CASILLA.C0200,
  MODELO_100_CASILLA.C0202,
  MODELO_100_CASILLA.C0203,
  MODELO_100_CASILLA.C0206,
  MODELO_100_CASILLA.C0208,
  MODELO_100_CASILLA.C0227,
  MODELO_100_CASILLA.C0217,
] as const;

export const MODELO_100_DEFAULT_CASILLA = MODELO_100_CASILLA.C0202;

// ============================================================
// FIXED ASSETS (INMOVILIZADO) & AMORTIZATION
// ============================================================

/**
 * Tabla de amortización simplificada (Orden de 27 de marzo de 1998), the table that applies in
 * estimación directa simplificada (art. 30.2 RIRPF). An asset is not consumed in the year it is
 * bought: its cost is spread over its useful life, and only the yearly dotación is deductible.
 *
 * Keyed by the grupo number the AEAT itself uses, so the value stored in
 * "FixedAssets"."AmortizationGroup" indexes this map directly, and a picker can render
 * `Object.values(AMORTIZATION_GROUP)` already in tabla order (integer keys iterate ascending).
 * The user-facing label of each group is an i18n key resolved in the UI — the Spanish text below
 * is the verbatim legal wording of the Orden, kept as a citation, not as display copy.
 *
 * `coefficientPercent` is the *maximum* linear rate. Amortising slower is legal, which is why the
 * rate actually applied lives on the asset (see FixedAsset.coefficientPercent) and is never
 * re-derived from the group at read time.
 */
export const AMORTIZATION_GROUP = {
  // Edificios y otras construcciones
  1: { group: 1, coefficientPercent: 3, maxYears: 68 },
  // Instalaciones, mobiliario, enseres y resto del inmovilizado material
  2: { group: 2, coefficientPercent: 10, maxYears: 20 },
  // Maquinaria
  3: { group: 3, coefficientPercent: 12, maxYears: 18 },
  // Elementos de transporte
  4: { group: 4, coefficientPercent: 16, maxYears: 14 },
  // Equipos para tratamiento de la información y sistemas y programas informáticos
  5: { group: 5, coefficientPercent: 26, maxYears: 10 },
  // Útiles y herramientas
  6: { group: 6, coefficientPercent: 30, maxYears: 8 },
  // Ganado vacuno, porcino, ovino y caprino
  7: { group: 7, coefficientPercent: 16, maxYears: 14 },
  // Ganado equino y frutales no cítricos
  8: { group: 8, coefficientPercent: 8, maxYears: 25 },
  // Frutales cítricos y viñedos
  9: { group: 9, coefficientPercent: 4, maxYears: 50 },
  // Olivar
  10: { group: 10, coefficientPercent: 2, maxYears: 100 },
} as const;

export type AmortizationGroupDefinition = (typeof AMORTIZATION_GROUP)[keyof typeof AMORTIZATION_GROUP];

/** The grupo number itself (1-10) — what the DB stores and what indexes AMORTIZATION_GROUP. */
export type AmortizationGroupNumber = AmortizationGroupDefinition['group'];

/** The ten groups in tabla order, for the picker and for validating an incoming group number. */
export const AMORTIZATION_GROUP_OPTIONS: readonly AmortizationGroupDefinition[] = Object.values(AMORTIZATION_GROUP);

/**
 * Amortización acelerada for empresas de reducida dimensión (art. 103 LIS). It reaches IRPF
 * through art. 30.2 LIRPF, so it applies in estimación directa in **both** modalidades, normal
 * and simplificada, and it doubles the maximum linear coefficient of the tabla.
 *
 * It only covers **elementos NUEVOS del inmovilizado material** (and inversiones inmobiliarias):
 * second-hand items and the inmovilizado intangible of casilla 0227 do not qualify, so the
 * doubling is a per-asset decision the user makes, never an automatic transformation.
 */
export const AMORTIZATION = {
  ERD_MULTIPLIER: 2,
} as const;

/**
 * The two Modelo 100 boxes a dotación can land in: inmovilizado material (0208) and intangible
 * (0227). Every other casilla is a real cash expense of the year and can never receive an
 * amortization figure.
 */
export const AMORTIZATION_CASILLA_OPTIONS = [MODELO_100_CASILLA.C0208, MODELO_100_CASILLA.C0227] as const;

export type AmortizationCasilla = (typeof AMORTIZATION_CASILLA_OPTIONS)[number];

// ============================================================
// APLAZAMIENTOS / FRACCIONAMIENTOS (AEAT deferrals)
// ============================================================

/**
 * The three legally distinct parts of one fracción of an aplazamiento. They are paid together
 * and are three different things, so each is booked as its own transaction:
 *
 * - **principal** — the IVA or IRPF being paid. Not an expense at all: it is the tax itself.
 * - **recargo** — recargo de apremio. Expressly NOT deductible (art. 15.c LIS).
 * - **interes** — intereses de demora. The only deductible part, and deductible as a *financial*
 *   expense (DGT V4080-15, STS 150/2021), so it lands in casilla 0203 and nowhere else.
 *
 * These are the literals of the "Transactions"."DeferralPart" CHECK constraint in
 * database/schema.sql; they must not drift apart.
 */
export const DEFERRAL_PART = {
  PRINCIPAL: 'principal',
  SURCHARGE: 'recargo',
  INTEREST: 'interes',
} as const;

export type DeferralPart = (typeof DEFERRAL_PART)[keyof typeof DEFERRAL_PART];

/** The three parts in the order ANEXO I prints its columns. */
export const DEFERRAL_PART_OPTIONS = [
  DEFERRAL_PART.PRINCIPAL,
  DEFERRAL_PART.SURCHARGE,
  DEFERRAL_PART.INTEREST,
] as const;

/**
 * The deductible share of each part, as a `DeductionPercent`. Not a preference: two of the three
 * are non-deductible by article, and the third is fully deductible. Booking a fracción whole is
 * what once left 95 EUR of interest undeducted and let a whole instalment be marked 100%
 * deductible by a stray click.
 */
export const DEFERRAL_PART_DEDUCTION_PERCENT = {
  [DEFERRAL_PART.PRINCIPAL]: 0,
  [DEFERRAL_PART.SURCHARGE]: 0,
  [DEFERRAL_PART.INTEREST]: 100,
} as const;

/**
 * Which figure of a fracción each part is worth, as a field name.
 *
 * One mapping for two shapes on purpose: `DeferralFraccion` (one row of ANEXO I) and
 * `DeferralTotals` (a column total, or the totals of a set of movements) both carry these three
 * keys, so the import that books a fracción and the cancellation that adds one back up read the
 * same table instead of each keeping a copy that can drift.
 */
export const DEFERRAL_PART_AMOUNT_FIELD = {
  [DEFERRAL_PART.PRINCIPAL]: 'principalCents',
  [DEFERRAL_PART.SURCHARGE]: 'surchargeCents',
  [DEFERRAL_PART.INTEREST]: 'interestCents',
} as const;

/**
 * Intereses de demora are *gastos financieros*, not "otros tributos": Modelo 100 casilla 0203.
 * The distinction is the whole point of the module — see DGT V4080-15 and STS 150/2021.
 */
export const DEFERRAL_INTEREST_CASILLA = MODELO_100_CASILLA.C0203;

/**
 * The well-known subcategories (under "Trabajo") the parts of a fracción are booked into, seeded
 * for every user by seedCategoriesForUser() and by database/seed.sql.
 *
 * The interés goes to the one carrying casilla 0203 ({@link DEFERRAL_INTEREST_CASILLA}) — the
 * whole reason the parts are split. The principal and the recargo go to "Impuestos", where the
 * user already books what is paid to the AEAT; its own casilla (0206) is never reached, because
 * both parts are stored at 0 % deduction and a row with nothing deductible enters no box.
 */
export const DEFERRAL_CATEGORY = {
  PARENT_NAME: 'Trabajo',
  INTEREST_SUBCATEGORY_NAME: 'Intereses de demora',
  TAX_SUBCATEGORY_NAME: 'Impuestos',
} as const;

/**
 * What a verification of an extracted resolution can disagree about.
 *
 * All but one compare the letter against **itself**: the sum of its ANEXO I rows against its own
 * totals row. None of them recomputes a *split* — AEAT loads the rounding remainder onto the last
 * fracción (781,66 x5 then 781,69), so a recomputed split is wrong by up to a few cents per
 * instalment and may never be treated as the source.
 *
 * `INTEREST_ACCRUAL` is the exception and the only one that recomputes anything: it re-derives
 * each fracción's interest from art. 53 RGR. It is also the only one with a tolerance, because
 * the letter prints its own rate truncated (4,062 for a real 4,0625 %).
 */
export const DEFERRAL_CHECK = {
  /** Sum of the fracciones' principal != the header's principal */
  PRINCIPAL_TOTAL: 'principal-total',
  /** Sum of the fracciones' recargo != the header's recargo */
  SURCHARGE_TOTAL: 'surcharge-total',
  /** Sum of the fracciones' intereses != the header's intereses */
  INTEREST_TOTAL: 'interest-total',
  /** A row's "total del plazo" != its own principal + recargo + interés */
  FRACCION_TOTAL: 'fraccion-total',
  /** No fracción was read at all, or their numbering is not 1..N without gaps */
  FRACCION_SEQUENCE: 'fraccion-sequence',
  /** The vencimientos do not run forward, or one falls on/before the fecha de intereses */
  DUE_DATE_ORDER: 'due-date-order',
  /** A row's interés does not match base x tipo x días / (100 x 365) — art. 53 RGR */
  INTEREST_ACCRUAL: 'interest-accrual',
} as const;

export type DeferralCheck = (typeof DEFERRAL_CHECK)[keyof typeof DEFERRAL_CHECK];

/**
 * Ceiling on the number of fracciones a single resolution may carry. AEAT grants far fewer (the
 * live letters have four and six), so this only stops a misread table from creating hundreds of
 * pending movements.
 */
export const DEFERRAL_MAX_FRACCIONES = 120;

/**
 * Where a deferral stands, DERIVED from the status of its fracción movements and never stored. A
 * stored copy would be one more flag that can go stale, and the movements are the only truth
 * about what has actually been paid.
 *
 * - `ACTIVE` — at least one fracción still pending.
 * - `SETTLED` — nothing pending and nothing cancelled: every fracción was paid, an early payoff
 *   included. Paying ahead of the calendar cancels nothing, because that money did move.
 * - `CANCELLED` — nothing pending left and at least one fracción cancelled.
 */
export const DEFERRAL_STATUS = {
  ACTIVE: 'active',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
} as const;

export type DeferralStatus = (typeof DEFERRAL_STATUS)[keyof typeof DEFERRAL_STATUS];

/**
 * The only movement status cancelling a resolution may touch, and what it becomes.
 *
 * `TRANSACTION_STATUS.CANCELLED` is the mechanism the app already has: every summary view and
 * every fiscal view filters it out, so a cancelled fracción leaves the 130 and the 100 exactly as
 * if it had never been booked. Cancelling therefore adds no parallel flag anywhere — not on
 * "Deferrals", not on "Transactions".
 *
 * A fracción already marked paid is never rewritten: that charge really did leave the account,
 * and its interés is a deductible expense of the year it was paid in.
 */
export const DEFERRAL_CANCELLABLE_MOVEMENT_STATUS = TRANSACTION_STATUS.PENDING;
export const DEFERRAL_CANCELLED_MOVEMENT_STATUS = TRANSACTION_STATUS.CANCELLED;

// Invoice Statuses
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

// An invoice counts as fiscal income once it is issued, collected or not.
// These statuses are duplicated as SQL literals inside "vw_FiscalAccrual"
// (database/schema.sql); fiscal-accrual-view-contract.test.ts fails if they drift apart.
export const ISSUED_INVOICE_STATUSES = [INVOICE_STATUS.FINALIZED, INVOICE_STATUS.PAID] as const;

/**
 * Why an issued invoice is worth pointing out while a quarter is being filed.
 *
 * None of the three is an error, and no copy built on them may say it is: "vw_FiscalAccrual"
 * books every invoice on its "InvoiceDate" and each model is right in all three cases. What
 * they surface is the disagreement between what the bank statement shows and what the quarter
 * declares — the reasoning that produced the 2T 2026 rectificativa.
 */
export const CROSS_QUARTER_CASE = {
  /** Declared in this quarter, collected in a different one. */
  COLLECTED_IN_ANOTHER_PERIOD: 'collected-in-another-period',
  /** Declared in this quarter, no collection on record. IVA is owed on issue, not on payment. */
  ISSUED_NOT_COLLECTED: 'issued-not-collected',
  /** Collected in this quarter, already declared in an earlier one. No model of this quarter counts it. */
  DECLARED_IN_EARLIER_PERIOD: 'declared-in-earlier-period',
  /**
   * The invoice is 'paid' and carries no linked movement: the money did arrive, the link to the
   * transaction was never written or was lost. A data-integrity finding, not a fiscal one — no
   * figure moves, because "vw_FiscalAccrual" books the invoice on its "InvoiceDate" either way.
   *
   * It is its own case because ISSUED_NOT_COLLECTED is only true of a 'finalized' invoice:
   * reporting a collected one as *sin cobro registrado* reads as *aún no cobrada*. What is really
   * lost is DECLARED_IN_EARLIER_PERIOD — with no collection date, money that arrived this quarter
   * for an invoice declared in an earlier one cannot be computed for this invoice at all.
   */
  PAID_WITHOUT_LINKED_MOVEMENT: 'paid-without-linked-movement',
} as const;

export type CrossQuarterCase = (typeof CROSS_QUARTER_CASE)[keyof typeof CROSS_QUARTER_CASE];

/**
 * The cases that report a broken record rather than a timing disagreement.
 *
 * The other three are informational and the app is right in all of them; this one asks for a link
 * to be repaired, so its tone and its copy must differ. Kept as a list so a fifth case of either
 * kind only has to be classified in one place.
 */
export const CROSS_QUARTER_DATA_INTEGRITY_CASES = [CROSS_QUARTER_CASE.PAID_WITHOUT_LINKED_MOVEMENT] as const;

export type CrossQuarterDataIntegrityCase = (typeof CROSS_QUARTER_DATA_INTEGRITY_CASES)[number];

// IRPF withholding a Spanish business client must retain from a professional's invoice.
// REDUCED applies during the year of registration and the two following ones.
// Never applies to private individuals or to foreign clients.
export const IRPF_RETENTION_RATE = {
  NONE: 0,
  REDUCED: 7,
  GENERAL: 15,
} as const;

export type IrpfRetentionRate = (typeof IRPF_RETENTION_RATE)[keyof typeof IRPF_RETENTION_RATE];

// Payment Methods
export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'bank_transfer',
  PAYPAL: 'paypal',
  OTHER: 'other',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// Invoice Billing Modes (UI-only: drives form render + PDF layout)
export const INVOICE_BILLING_MODE = {
  HOURLY: 'hourly',
  FLAT: 'flat',
} as const;

export type InvoiceBillingMode = (typeof INVOICE_BILLING_MODE)[keyof typeof INVOICE_BILLING_MODE];

/**
 * Size limits of an invoice line item. Shared by the Zod schema and the CSV
 * importer so a file that the importer accepts can never be rejected later by
 * the API — or the other way round.
 */
export const INVOICE_LINE_ITEM_LIMIT = {
  MAX_LINE_ITEMS: 50,
  MAX_SUB_ITEMS: 20,
  TITLE_LENGTH: 500,
  SUB_ITEM_LENGTH: 500,
  DESCRIPTION_LENGTH: 2000,
} as const;

/**
 * Column names accepted by the invoice line-item CSV importer.
 * Every column also accepts its Spanish alias, since the sheet is usually
 * authored in Spanish. Headers are matched case-insensitively.
 */
export const INVOICE_CSV_COLUMN = {
  TITLE: 'title',
  SUB_ITEMS: 'subitems',
  DESCRIPTION: 'description',
  HOURS: 'hours',
  HOURLY_RATE: 'hourlyrate',
  AMOUNT: 'amount',
} as const;

export type InvoiceCsvColumn = (typeof INVOICE_CSV_COLUMN)[keyof typeof INVOICE_CSV_COLUMN];

// Separator for the sub-items packed into a single CSV cell
export const INVOICE_CSV_SUB_ITEM_SEPARATOR = '|';

// i18n keys for CSV import failures (file-level and per-row)
export const INVOICE_CSV_ERROR = {
  EMPTY_FILE: 'invoices.csv.errors.empty-file',
  NOT_CSV: 'invoices.csv.errors.not-csv',
  FILE_TOO_LARGE: 'invoices.csv.errors.file-too-large',
  READ_FAILED: 'invoices.csv.errors.read-failed',
  BAD_ENCODING: 'invoices.csv.errors.bad-encoding',
  INVOICE_FULL: 'invoices.csv.errors.invoice-full',
  MISSING_COLUMNS: 'invoices.csv.errors.missing-columns',
  NO_ROWS: 'invoices.csv.errors.no-rows',
  TOO_MANY_ROWS: 'invoices.csv.errors.too-many-rows',
  TITLE_REQUIRED: 'invoices.csv.errors.title-required',
  TITLE_TOO_LONG: 'invoices.csv.errors.title-too-long',
  SUB_ITEM_TOO_LONG: 'invoices.csv.errors.sub-item-too-long',
  TOO_MANY_SUB_ITEMS: 'invoices.csv.errors.too-many-sub-items',
  DESCRIPTION_TOO_LONG: 'invoices.csv.errors.description-too-long',
  INVALID_HOURS: 'invoices.csv.errors.invalid-hours',
  INVALID_HOURLY_RATE: 'invoices.csv.errors.invalid-hourly-rate',
  INVALID_AMOUNT: 'invoices.csv.errors.invalid-amount',
  HOURLY_RATE_REQUIRED: 'invoices.csv.errors.hourly-rate-required',
  AMOUNT_REQUIRED: 'invoices.csv.errors.amount-required',
  AMOUNT_MISMATCH: 'invoices.csv.errors.amount-mismatch',
} as const;

export type InvoiceCsvError = (typeof INVOICE_CSV_ERROR)[keyof typeof INVOICE_CSV_ERROR];

// Company Roles
export const COMPANY_ROLE = {
  CLIENT: 'client',
  PROVIDER: 'provider',
} as const;

export type CompanyRole = (typeof COMPANY_ROLE)[keyof typeof COMPANY_ROLE];

// Fiscal Document Types
export const FISCAL_DOCUMENT_TYPE = {
  MODELO: 'modelo',
  FACTURA_RECIBIDA: 'factura_recibida',
  FACTURA_EMITIDA: 'factura_emitida',
} as const;

export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPE)[keyof typeof FISCAL_DOCUMENT_TYPE];

// Modelo Types
export const MODELO_TYPE = {
  M303: '303',
  M130: '130',
  M390: '390',
  M100: '100',
} as const;

export type ModeloType = (typeof MODELO_TYPE)[keyof typeof MODELO_TYPE];

// Fiscal Document Status
export const FISCAL_STATUS = {
  PENDING: 'pending',
  FILED: 'filed',
} as const;

export type FiscalStatus = (typeof FISCAL_STATUS)[keyof typeof FISCAL_STATUS];

// Filing Status (computed server-side)
export const FILING_STATUS = {
  NOT_DUE: 'not_due',
  UPCOMING: 'upcoming',
  DUE: 'due',
  OVERDUE: 'overdue',
  FILED: 'filed',
} as const;

export type FilingStatus = (typeof FILING_STATUS)[keyof typeof FILING_STATUS];

/**
 * Where a cross-quarter finding may qualify a deadline that already exists.
 *
 * It never becomes a deadline of its own: nothing new falls due because an invoice was collected
 * in another quarter. It rides the 303 and the 130 of the quarter it belongs to — the two filings
 * whose figures a devengo/cobro disagreement can distort. The annual 390 and 100 are excluded
 * because a quarter boundary inside one year moves nothing for them.
 */
export const CROSS_QUARTER_DEADLINE_MODELOS = [MODELO_TYPE.M303, MODELO_TYPE.M130] as const;

/**
 * And when. Only a filing the user is about to make is worth qualifying: NOT_DUE is noise months
 * ahead and FILED is too late to inform. OVERDUE is left out on purpose — that deadline already
 * shouts on its own, and this note exists to reach the user while the figure is still being
 * decided.
 */
export const CROSS_QUARTER_DEADLINE_FILING_STATUSES = [FILING_STATUS.UPCOMING, FILING_STATUS.DUE] as const;

/**
 * DOM id of the cross-quarter detail on /fiscal. A note that states a count and an amount owes the
 * user the list behind them, and the list already exists — this is how the deadline surface links
 * to it instead of restating it.
 */
export const CROSS_QUARTER_PANEL_ANCHOR = 'devengo-cobro';

// ============================================================
// MODIFICACIÓN DE LA BASE IMPONIBLE POR CRÉDITO INCOBRABLE
// (art. 80.Cuatro LIVA) — a clock and a checklist, nothing more
// ============================================================

/**
 * An invoice that will not be paid lets the IVA repercutido already declared on it be recovered,
 * by issuing a factura rectificativa inside a window that closes for good. Everything below is
 * the arithmetic of that window and the formalities around it. Nothing here issues a
 * rectificativa, files anything, or touches an invoice's status.
 *
 * Vigencia verified on 18-ago-2026 against the BOE consolidated texts: art. 80 LIVA in the
 * version in force since 1-1-2023 (art. 77 Ley 31/2022, BOE-A-2022-22128), with no later
 * amendment reaching it, and art. 24 RIVA in force since 1-1-2024 (art. 1.4 RD 1171/2023,
 * BOE-A-2023-26454).
 *
 * Sources: BOE https://www.boe.es/eli/es/l/1992/12/28/37 · AEAT, Manual práctico IVA 2025 ·
 * AEAT, procedimiento G416 (modelo 952).
 */

/**
 * The waiting term that must elapse from the devengo without collection before the credit counts
 * as incobrable — art. 80.Cuatro.A).1.ª.
 *
 * One year is the general rule (párr. 1). Six months is an option open to whoever billed at most
 * {@link BAD_DEBT_PYME_TURNOVER_THRESHOLD_CENTS} in the previous calendar year (párr. 3, computed
 * per art. 121 LIVA) — the article reads «podrá ser, de seis meses o un año», so it is a genuine
 * choice by the taxpayer and not one the app may make for them.
 *
 * NOT CONFIRMED, and deliberately not encoded as certainty: whether exhausting the six-month
 * window still leaves the one-year one available, contiguous as the two are by construction. No
 * DGT ruling saying so was found. Both terms are therefore always presented as labelled
 * alternatives, and the chosen term is stored nowhere.
 */
export const BAD_DEBT_WAITING_TERM = {
  /** art. 80.Cuatro.A).1.ª párr. 3 — the PYME option */
  PYME_SIX_MONTHS: 'pyme-six-months',
  /** art. 80.Cuatro.A).1.ª párr. 1 — the general rule */
  GENERAL_ONE_YEAR: 'general-one-year',
} as const;

export type BadDebtWaitingTerm = (typeof BAD_DEBT_WAITING_TERM)[keyof typeof BAD_DEBT_WAITING_TERM];

/** How long each term runs, in whole months from the devengo. */
export const BAD_DEBT_WAITING_TERM_MONTHS = {
  [BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS]: 6,
  [BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR]: 12,
} as const;

/** Both terms, shortest first: the first window to open is the first the user may act on. */
export const BAD_DEBT_WAITING_TERM_OPTIONS = [
  BAD_DEBT_WAITING_TERM.PYME_SIX_MONTHS,
  BAD_DEBT_WAITING_TERM.GENERAL_ONE_YEAR,
] as const;

/**
 * Months to expedir the factura rectificativa once the waiting term has elapsed —
 * art. 80.Cuatro.B): «en el plazo de los seis meses siguientes a la finalización del periodo de
 * seis meses o un año». A plazo de caducidad: letting it pass loses the right permanently (TEAC
 * 00/05698/2023 treats these requirements as substantive, on the earlier three-month wording).
 */
export const BAD_DEBT_RECTIFICATION_WINDOW_MONTHS = 6;

/**
 * Months to notify the AEAT once the rectificativa has been issued — art. 24.2.a).2.º RIVA, «en
 * el plazo de un mes contado desde la fecha de expedición de la factura rectificativa», by
 * electronic means. The AEAT G416 procedure sheet prints «plazo de presentación: No tiene»; the
 * RIVA prevails and the sheet is not normative.
 */
export const BAD_DEBT_AEAT_NOTICE_MONTHS = 1;

/**
 * Months to modify the base imponible back UPWARDS after desisting from the reclamación judicial
 * or agreeing a settlement with the debtor — art. 80.Cuatro.C). A second clock, and the one that
 * catches a user who recovered the IVA and then reached an agreement.
 */
export const BAD_DEBT_UPWARD_REVISION_MONTHS = 1;

/**
 * 6.010.121,04 €: the previous calendar year's volumen de operaciones (art. 121 LIVA) at or below
 * which the six-month term is available — art. 80.Cuatro.A).1.ª párr. 3.
 */
export const BAD_DEBT_PYME_TURNOVER_THRESHOLD_CENTS = 601_012_104;

/** The AEAT form the communication is made on, and where its procedure is documented. */
export const BAD_DEBT_AEAT_FORM = {
  MODELO: '952',
  PROCEDURE_CODE: 'G416',
  PROCEDURE_URL: 'https://sede.agenciatributaria.gob.es/Sede/procedimientos/G416.shtml',
} as const;

/**
 * How many days before a window opens the invoice starts being surfaced. A product decision, not
 * a legal term: instar el cobro por un medio fehaciente (step CLAIM_PAYMENT) has to be done and
 * documented before the rectificativa can be issued, so warning on the day the window opens would
 * already be late.
 */
export const BAD_DEBT_APPROACHING_DAYS = 60;

/**
 * Where an invoice stands against its window.
 *
 * There is deliberately no *pendiente de comunicar el 952* stage. That clock starts on the date a
 * rectificativa was expedida, and this module neither issues one nor records that anyone did — a
 * stage nothing could ever compute would be a lie in the type. The one-month term lives in the
 * checklist as text ({@link BAD_DEBT_AEAT_NOTICE_MONTHS}).
 */
export const BAD_DEBT_STAGE = {
  /** The gate is closed: art. 80.Cuatro does not reach this invoice at all */
  OUT_OF_SCOPE: 'out-of-scope',
  /** The waiting term has not elapsed yet */
  WAITING: 'waiting',
  /** Inside the six months of art. 80.Cuatro.B): the rectificativa may be issued now */
  IN_WINDOW: 'in-window',
  /** The window closed. For that term the right is lost */
  WINDOW_EXPIRED: 'window-expired',
} as const;

export type BadDebtStage = (typeof BAD_DEBT_STAGE)[keyof typeof BAD_DEBT_STAGE];

/**
 * Why art. 80.Cuatro does not reach an invoice. The gate is FAIL-CLOSED: an invoice enters the
 * clock only when every reason below has been ruled out, and a missing datum keeps it out rather
 * than letting it in.
 *
 * For this user's portfolio — services to businesses established outside the TAI, no sujetas por
 * reglas de localización (art. 69.Uno.1.º LIVA), declared in casilla 120 — the module is expected
 * to be empty, and that is the correct answer rather than a bug. DW-09 (1.200,00 €, finalized
 * 3-ago-2026, never collected) is out on NO_OUTPUT_VAT and on RECIPIENT_NOT_ESTABLISHED, two
 * independent grounds.
 */
export const BAD_DEBT_EXCLUSION = {
  /**
   * art. 80.Cuatro reduces the base «cuando los créditos correspondientes a las cuotas
   * repercutidas por las operaciones gravadas sean total o parcialmente incobrables». With
   * "VatPercent" = 0 there is no cuota to recover: a rectificativa would move 0,00 € in the 303,
   * and no right is lost by letting the window pass.
   */
  NO_OUTPUT_VAT: 'no-output-vat',
  /**
   * art. 80.Cinco.2.ª: no modification when the recipient is not established in the TAI, Canarias,
   * Ceuta or Melilla. Art. 24.2.a).2.º RIVA turns it into an express declaration by the acreedor,
   * so filing a 952 for a foreign client is declaring something false. The only carve-out —
   * insolvencia declared by a court of another Member State under Reglamento (UE) 2015/848 —
   * routes the case through art. 80.Tres, not through the Cuatro, and is outside this module.
   */
  RECIPIENT_NOT_ESTABLISHED: 'recipient-not-established',
  /** The invoice snapshot does not say where the client is. Fail-closed: unknown is not a yes */
  RECIPIENT_ESTABLISHMENT_UNKNOWN: 'recipient-establishment-unknown',
  /** A draft or a cancelled invoice declared nothing and repercutió nothing */
  NOT_ISSUED: 'not-issued',
  /** The invoice was collected: there is no impagado to recover */
  COLLECTED: 'collected',
} as const;

export type BadDebtExclusion = (typeof BAD_DEBT_EXCLUSION)[keyof typeof BAD_DEBT_EXCLUSION];

/**
 * "ClientCountry" values that place the recipient inside Spanish territory for art. 80.Cinco.2.ª,
 * which names the TAI, Canarias, Ceuta and Melilla — so plain Spain covers all four. Compared
 * lowercased and stripped of accents; anything else, NULL and empty included, closes the gate.
 */
export const SPANISH_ESTABLISHMENT_COUNTRY_TOKENS = ['es', 'esp', 'espana', 'spain'] as const;

/**
 * What has to be done, in order, once a window is open. Each step is rendered from i18n; the norm
 * it rests on is {@link BAD_DEBT_CHECKLIST_LEGAL_BASIS}.
 */
export const BAD_DEBT_CHECKLIST_STEP = {
  /** Instar el cobro: reclamación judicial, requerimiento notarial or any medio fehaciente */
  CLAIM_PAYMENT: 'claim-payment',
  /** The operation and the impago must be booked in the Libros Registro, in time and form */
  BOOK_IN_REGISTERS: 'book-in-registers',
  /** Expedir the rectificativa inside the window */
  ISSUE_RECTIFICATIVA: 'issue-rectificativa',
  /** Remitirla to the destinatario, and be able to prove the remission */
  SEND_RECTIFICATIVA: 'send-rectificativa',
  /** Aportar the supporting documents through the registro electrónico and keep its código */
  UPLOAD_EVIDENCE: 'upload-evidence',
  /** Present the modelo 952 within one month of the rectificativa */
  FILE_MODELO_952: 'file-modelo-952',
  /** Carry the minoración into the 303 of the period */
  ADJUST_303: 'adjust-303',
} as const;

export type BadDebtChecklistStep = (typeof BAD_DEBT_CHECKLIST_STEP)[keyof typeof BAD_DEBT_CHECKLIST_STEP];

/** The steps in the order they have to happen. */
export const BAD_DEBT_CHECKLIST_STEPS = [
  BAD_DEBT_CHECKLIST_STEP.CLAIM_PAYMENT,
  BAD_DEBT_CHECKLIST_STEP.BOOK_IN_REGISTERS,
  BAD_DEBT_CHECKLIST_STEP.ISSUE_RECTIFICATIVA,
  BAD_DEBT_CHECKLIST_STEP.SEND_RECTIFICATIVA,
  BAD_DEBT_CHECKLIST_STEP.UPLOAD_EVIDENCE,
  BAD_DEBT_CHECKLIST_STEP.FILE_MODELO_952,
  BAD_DEBT_CHECKLIST_STEP.ADJUST_303,
] as const;

/**
 * The norm each step rests on. Normative citations, not copy: they read the same in both locales,
 * exactly like the casilla numbers, and duplicating them across es.json and en.json would only
 * let them drift.
 *
 * CLAIM_PAYMENT comes first because the documentation of the claim has to travel with the 952.
 * Whether the claim must predate the end of the waiting term or only the rectificativa is NOT
 * ESTABLISHED — no source settles it — so the checklist orders it early without asserting it.
 */
export const BAD_DEBT_CHECKLIST_LEGAL_BASIS = {
  [BAD_DEBT_CHECKLIST_STEP.CLAIM_PAYMENT]: 'art. 80.Cuatro.A).4.ª LIVA',
  [BAD_DEBT_CHECKLIST_STEP.BOOK_IN_REGISTERS]: 'art. 80.Cuatro.A).2.ª LIVA; art. 24.2.a).1.º RIVA',
  [BAD_DEBT_CHECKLIST_STEP.ISSUE_RECTIFICATIVA]: 'art. 80.Cuatro.B) LIVA; art. 15 RD 1619/2012',
  [BAD_DEBT_CHECKLIST_STEP.SEND_RECTIFICATIVA]: 'art. 24.1 RIVA; STS 371/2025',
  [BAD_DEBT_CHECKLIST_STEP.UPLOAD_EVIDENCE]: 'art. 24.2.a).2.º RIVA',
  [BAD_DEBT_CHECKLIST_STEP.FILE_MODELO_952]: 'art. 24.2.a).2.º RIVA',
  [BAD_DEBT_CHECKLIST_STEP.ADJUST_303]: 'art. 80.Cuatro LIVA',
} as const satisfies Record<BadDebtChecklistStep, string>;

// Extraction Status (OCR pipeline)
export const EXTRACTION_STATUS = {
  NOT_EXTRACTED: 'not_extracted',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  FAILED: 'failed',
} as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUS)[keyof typeof EXTRACTION_STATUS];

// Minimum OCR confidence below which extracted data is flagged for manual review
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

// OCR confidence at or above which the extraction is considered reliable
export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

// ============================================================
// CRYPTO MODULE
// ============================================================

// Supported exchanges
export const CRYPTO_EXCHANGE = {
  BINANCE: 'binance',
  KRAKEN: 'kraken',
  COINBASE: 'coinbase',
} as const;

export type CryptoExchange = (typeof CRYPTO_EXCHANGE)[keyof typeof CRYPTO_EXCHANGE];

// Raw event types ingested from exchanges (one per Binance endpoint family)
export const CRYPTO_EVENT_TYPE = {
  SPOT_TRADE: 'spot_trade',
  CONVERT: 'convert',
  EARN_FLEX: 'earn_flex',
  EARN_LOCKED: 'earn_locked',
  ETH_STAKING: 'eth_staking',
  STAKING_INTEREST: 'staking_interest',
  DIVIDEND: 'dividend',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  FIAT_ORDER: 'fiat_order',
  FIAT_PAYMENT: 'fiat_payment',
  DUST: 'dust',
  C2C: 'c2c',
  CSV_IMPORT: 'csv_import',
} as const;

export type CryptoEventType = (typeof CRYPTO_EVENT_TYPE)[keyof typeof CRYPTO_EVENT_TYPE];

// Normalised taxable event kinds (output of the EventNormalizer)
export const CRYPTO_TAXABLE_KIND = {
  DISPOSAL: 'disposal',
  ACQUISITION: 'acquisition',
  AIRDROP: 'airdrop',
  STAKING_REWARD: 'staking_reward',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
} as const;

export type CryptoTaxableKind = (typeof CRYPTO_TAXABLE_KIND)[keyof typeof CRYPTO_TAXABLE_KIND];

// Contraprestación type for Modelo 100 casilla 1804 (F = fiat, N = non-fiat / crypto-to-crypto)
export const CRYPTO_CONTRAPRESTACION = {
  FIAT: 'F',
  NON_FIAT: 'N',
} as const;

export type CryptoContraprestacion = (typeof CRYPTO_CONTRAPRESTACION)[keyof typeof CRYPTO_CONTRAPRESTACION];

// Price resolution source for a TaxableEvent leg / acquisition lot. Recorded so
// AEAT can audit how each EUR value was derived, and so disposals priced from an
// 'unresolved' (0) lookup can be flagged for manual review in Modelo 100.
export const CRYPTO_PRICE_SOURCE = {
  CACHE: 'cache',
  EUR_SELF: 'eur_self',
  FIAT_COUNTER: 'fiat_counter',
  STABLECOIN_USD_CROSS: 'stablecoin_usd_cross',
  BINANCE_EUR: 'binance_eur',
  BINANCE_USDT_CROSS: 'binance_usdt_cross',
  COINGECKO: 'coingecko',
  UNRESOLVED: 'unresolved',
} as const;

export type CryptoPriceSource = (typeof CRYPTO_PRICE_SOURCE)[keyof typeof CRYPTO_PRICE_SOURCE];

// Sync job status
export const CRYPTO_SYNC_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type CryptoSyncStatus = (typeof CRYPTO_SYNC_STATUS)[keyof typeof CRYPTO_SYNC_STATUS];

// Modelo 100 crypto casillas
export const MODELO_100_CRYPTO_CASILLA = {
  C1804: '1804', // Ganancias/pérdidas patrimoniales por transmisión de cripto
  C0304: '0304', // Otras ganancias patrimoniales (airdrops)
  C0033: '0033', // Rendimientos del capital mobiliario (staking/Earn)
} as const;

// Sync mode: full = backfill desde scopeFrom; incremental = desde LastSyncCompletedAt
export const CRYPTO_SYNC_MODE = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
} as const;

export type CryptoSyncMode = (typeof CRYPTO_SYNC_MODE)[keyof typeof CRYPTO_SYNC_MODE];

// Candlestick (kline) intervals supported by the crypto price chart.
export const KLINE_INTERVAL = {
  ONE_HOUR: '1h',
  FOUR_HOURS: '4h',
  ONE_DAY: '1d',
} as const;

export type KlineInterval = (typeof KLINE_INTERVAL)[keyof typeof KLINE_INTERVAL];

// Maximum window size (days) per Binance endpoint family.
// Documented limits — going beyond these returns empty arrays or 400.
export const BINANCE_WINDOW_DAYS = {
  SPOT_TRADE: 1, // myTrades requires startTime/endTime within 24h
  CONVERT: 30,
  EARN_REWARDS: 30, // simple-earn flexible+locked: 30 days max (-6021 otherwise)
  ETH_STAKING: 90,
  STAKING_INTEREST: 90,
  DIVIDEND: 180, // assetDividend: 6 months
  DEPOSIT: 90,
  WITHDRAW: 90,
  FIAT_ORDER: 90,
  FIAT_PAYMENT: 90,
  DUST: 30, // dribblet has tighter practical window than docs claim
  C2C: 30, // C2C only returns last 6 months total in any case
} as const;

// Per-IP REST weight budget (Binance: 6000 weight/min). We self-throttle
// at 80% to leave headroom for retries.
export const BINANCE_WEIGHT_LIMIT = 6000;
export const BINANCE_WEIGHT_THRESHOLD = 4800;
export const BINANCE_RETRY_BASE_MS = 2000;
export const BINANCE_RETRY_MAX_MS = 60_000;
export const BINANCE_RETRY_MAX_ATTEMPTS = 5;
export const BINANCE_SYNC_CONCURRENCY = 3;

// Earliest plausible Binance account creation. Used as fallback when we can
// neither probe the first trade nor read account.createTime.
export const BINANCE_GENESIS_DATE = '2017-07-14T00:00:00Z';

// Month format regex
export const MONTH_FORMAT_REGEX = /^\d{4}-\d{2}$/;

// ============================================================
// API ERROR CODES (i18n keys — backend returns these, frontend translates)
// ============================================================

export const API_ERROR = {
  UNAUTHORIZED: 'api-error.unauthorized',
  INTERNAL: 'api-error.internal',
  INVALID_ID: 'api-error.invalid-id',
  LOAD: {
    CATEGORIES: 'api-error.load.categories',
    CATEGORY_HISTORY: 'api-error.load.category-history',
    VOUCHERS: 'api-error.load.vouchers',
    FIXED_ASSETS: 'api-error.load.fixed-assets',
    DEFERRALS: 'api-error.load.deferrals',
    /** The art. 80.Cuatro clock (GET /api/fiscal/bad-debt) */
    BAD_DEBT: 'api-error.load.bad-debt',
    /** The preview of what cancelling a deferral would do (GET .../deferrals/[id]/cancel) */
    DEFERRAL_CANCELLATION: 'api-error.load.deferral-cancellation',
  },
  NOT_FOUND: {
    TRANSACTION: 'api-error.not-found.transaction',
    CATEGORY: 'api-error.not-found.category',
    INVOICE: 'api-error.not-found.invoice',
    COMPANY: 'api-error.not-found.company',
    TRIP: 'api-error.not-found.trip',
    EXPENSE: 'api-error.not-found.expense',
    RECURRING_EXPENSE: 'api-error.not-found.recurring-expense',
    OCCURRENCE: 'api-error.not-found.occurrence',
    GROUP: 'api-error.not-found.group',
    JUMP: 'api-error.not-found.jump',
    TUNNEL_SESSION: 'api-error.not-found.tunnel-session',
    VOUCHER: 'api-error.not-found.voucher',
    PREFIX: 'api-error.not-found.prefix',
    DOCUMENT: 'api-error.not-found.document',
    DOCUMENT_BLOB: 'api-error.not-found.document-blob',
    BILLING_PROFILE: 'api-error.not-found.billing-profile',
    FIXED_ASSET: 'api-error.not-found.fixed-asset',
    DEFERRAL: 'api-error.not-found.deferral',
    CRYPTO_CREDENTIALS: 'api-error.not-found.crypto-credentials',
    CRYPTO_SYNC_JOB: 'api-error.not-found.crypto-sync-job',
  },
  CONFLICT: {
    HAS_TRANSACTIONS: 'api-error.conflict.has-transactions',
    HAS_SUBCATEGORIES: 'api-error.conflict.has-subcategories',
    PREFIX_IN_USE: 'api-error.conflict.prefix-in-use',
    PREFIX_EXISTS: 'api-error.conflict.prefix-exists',
    FUTURE_OCCURRENCE: 'api-error.conflict.future-occurrence',
    DEFERRAL_EXPEDIENTE_EXISTS: 'api-error.conflict.deferral-expediente-exists',
    DEFERRAL_NOTHING_TO_CANCEL: 'api-error.conflict.deferral-nothing-to-cancel',
  },
  INVOICE: {
    CATEGORY_REQUIRED_FOR_PAID: 'api-error.invoice.category-required-for-paid',
    CANNOT_FINALIZE: 'api-error.invoice.cannot-finalize',
    ONLY_DRAFT_EDITABLE: 'api-error.invoice.only-draft-editable',
    ONLY_DRAFT_DELETABLE: 'api-error.invoice.only-draft-deletable',
    NUMBERED_NOT_DELETABLE: 'api-error.invoice.numbered-not-deletable',
    PERIOD_ALREADY_FILED: 'api-error.invoice.period-already-filed',
    DATE_FROZEN_ON_NUMBERED: 'api-error.invoice.date-frozen-on-numbered',
    INVALID_STATUS_TRANSITION: 'api-error.invoice.invalid-status-transition',
    BANK_FEE_CATEGORY_NOT_FOUND: 'api-error.invoice.bank-fee-category-not-found',
  },
  FISCAL: {
    UNSUPPORTED_FILE_TYPE: 'api-error.fiscal.unsupported-file-type',
    FILE_REQUIRED: 'api-error.fiscal.file-required',
    METADATA_REQUIRED: 'api-error.fiscal.metadata-required',
    EXTRACTION_FAILED: 'api-error.fiscal.extraction-failed',
    DETECTION_FAILED: 'api-error.fiscal.detection-failed',
    DOWNLOAD_FAILED: 'api-error.fiscal.download-failed',
    DEFERRAL_EXTRACTION_FAILED: 'api-error.fiscal.deferral-extraction-failed',
    DEFERRAL_TOTALS_MISMATCH: 'api-error.fiscal.deferral-totals-mismatch',
  },
  SKYDIVE: {
    NOT_VOUCHER_CONSUMPTION: 'api-error.skydive.not-voucher-consumption',
    NOT_SKYDIVE_CONSUMPTION: 'api-error.skydive.not-skydive-consumption',
    CATEGORY_NOT_RECONCILABLE: 'api-error.skydive.category-not-reconcilable',
  },
  CRYPTO: {
    UNSAFE_PERMISSIONS: 'api-error.crypto.unsafe-permissions',
    INVALID_SIGNATURE: 'api-error.crypto.invalid-signature',
    RATE_LIMITED: 'api-error.crypto.rate-limited',
    EXCHANGE_UNAVAILABLE: 'api-error.crypto.exchange-unavailable',
    PRICE_NOT_FOUND: 'api-error.crypto.price-not-found',
    DECRYPT_FAILED: 'api-error.crypto.decrypt-failed',
    MASTER_KEY_MISSING: 'api-error.crypto.master-key-missing',
    SYNC_ALREADY_RUNNING: 'api-error.crypto.sync-already-running',
    SYNC_FAILED: 'api-error.crypto.sync-failed',
    UNAUTHORISED_CRON: 'api-error.crypto.unauthorised-cron',
    CSV_FILE_REQUIRED: 'api-error.crypto.csv-file-required',
    CSV_INVALID_FORMAT: 'api-error.crypto.csv-invalid-format',
    CSV_TOO_LARGE: 'api-error.crypto.csv-too-large',
    CSV_UNSUPPORTED_EXCHANGE: 'api-error.crypto.csv-unsupported-exchange',
    CSV_UNRECOGNIZED: 'api-error.crypto.csv-unrecognized',
  },
  VALIDATION: {
    INVALID_MONTH: 'api-error.validation.invalid-month',
    CATEGORY_ID_REQUIRED: 'api-error.validation.category-id-required',
    NAME_REQUIRED: 'api-error.validation.name-required',
    NOT_AVAILABLE_IN_PROD: 'api-error.validation.not-available-in-prod',
  },
  MUTATION: {
    CREATE: {
      TRANSACTION: 'api-error.mutation.create.transaction',
      CATEGORY: 'api-error.mutation.create.category',
      INVOICE: 'api-error.mutation.create.invoice',
      COMPANY: 'api-error.mutation.create.company',
      PREFIX: 'api-error.mutation.create.prefix',
      RECURRING_EXPENSE: 'api-error.mutation.create.recurring-expense',
      TRIP: 'api-error.mutation.create.trip',
      TRIP_EXPENSE: 'api-error.mutation.create.trip-expense',
      JUMP: 'api-error.mutation.create.jump',
      TUNNEL_SESSION: 'api-error.mutation.create.tunnel-session',
      VOUCHER: 'api-error.mutation.create.voucher',
      GROUP: 'api-error.mutation.create.group',
      FIXED_ASSET: 'api-error.mutation.create.fixed-asset',
      DEFERRAL: 'api-error.mutation.create.deferral',
      CRYPTO_CREDENTIALS: 'api-error.mutation.create.crypto-credentials',
    },
    UPDATE: {
      TRANSACTION: 'api-error.mutation.update.transaction',
      CATEGORY: 'api-error.mutation.update.category',
      INVOICE: 'api-error.mutation.update.invoice',
      COMPANY: 'api-error.mutation.update.company',
      PREFIX: 'api-error.mutation.update.prefix',
      BILLING_PROFILE: 'api-error.mutation.update.billing-profile',
      RECURRING_EXPENSE: 'api-error.mutation.update.recurring-expense',
      TRIP: 'api-error.mutation.update.trip',
      TRIP_EXPENSE: 'api-error.mutation.update.trip-expense',
      JUMP: 'api-error.mutation.update.jump',
      TUNNEL_SESSION: 'api-error.mutation.update.tunnel-session',
      VOUCHER: 'api-error.mutation.update.voucher',
      FISCAL_STATUS: 'api-error.mutation.update.fiscal-status',
      FISCAL_SETTINGS: 'api-error.mutation.update.fiscal-settings',
      FISCAL_PROFILE: 'api-error.mutation.update.fiscal-profile',
      FIXED_ASSET: 'api-error.mutation.update.fixed-asset',
      DEFERRAL: 'api-error.mutation.update.deferral',
    },
    DELETE: {
      TRANSACTION: 'api-error.mutation.delete.transaction',
      CATEGORY: 'api-error.mutation.delete.category',
      INVOICE: 'api-error.mutation.delete.invoice',
      COMPANY: 'api-error.mutation.delete.company',
      PREFIX: 'api-error.mutation.delete.prefix',
      RECURRING_EXPENSE: 'api-error.mutation.delete.recurring-expense',
      TRIP: 'api-error.mutation.delete.trip',
      TRIP_EXPENSE: 'api-error.mutation.delete.trip-expense',
      JUMP: 'api-error.mutation.delete.jump',
      TUNNEL_SESSION: 'api-error.mutation.delete.tunnel-session',
      VOUCHER: 'api-error.mutation.delete.voucher',
      FISCAL_DOCUMENT: 'api-error.mutation.delete.fiscal-document',
      FIXED_ASSET: 'api-error.mutation.delete.fixed-asset',
      DEFERRAL: 'api-error.mutation.delete.deferral',
      CRYPTO_CREDENTIALS: 'api-error.mutation.delete.crypto-credentials',
    },
    /**
     * Cancelling is neither a delete nor an update: nothing is removed and no figure is rewritten,
     * the pending movements simply take TRANSACTION_STATUS.CANCELLED. Filing it under DELETE would
     * have the fallback message promise a destruction that never happens.
     */
    CANCEL: {
      DEFERRAL: 'api-error.mutation.cancel.deferral',
    },
    IMPORT: {
      JUMPS: 'api-error.mutation.import.jumps',
      TUNNEL_SESSIONS: 'api-error.mutation.import.tunnel-sessions',
      CRYPTO_CSV: 'api-error.mutation.import.crypto-csv',
    },
    UPLOAD: {
      FISCAL_DOCUMENT: 'api-error.mutation.upload.fiscal-document',
      FISCAL_BULK: 'api-error.mutation.upload.fiscal-bulk',
    },
    FINALIZE: {
      INVOICE: 'api-error.mutation.finalize.invoice',
    },
    LINK: {
      FISCAL_TRANSACTION: 'api-error.mutation.link.fiscal-transaction',
    },
    SYNC: {
      CRYPTO: 'api-error.mutation.sync.crypto',
    },
    RECONCILE: {
      VOUCHER: 'api-error.mutation.reconcile-voucher',
    },
  },
} as const;

// ============================================================
// VALIDATION KEY CONSTANTS (i18n keys for Zod schema messages)
// ============================================================

export const VALIDATION_KEY = {
  CATEGORY_REQUIRED: 'validation.category-required',
  AMOUNT_POSITIVE: 'validation.amount-positive',
  AMOUNT_NON_NEGATIVE: 'validation.amount-non-negative',
  AMOUNT_TOO_LARGE: 'validation.amount-too-large',
  DESCRIPTION_TOO_LONG: 'validation.description-too-long',
  DESCRIPTION_REQUIRED: 'validation.description-required',
  TITLE_OR_DESCRIPTION_REQUIRED: 'validation.title-or-description-required',
  TITLE_TOO_LONG: 'validation.title-too-long',
  SUB_ITEM_TOO_LONG: 'validation.sub-item-too-long',
  TOO_MANY_SUB_ITEMS: 'validation.too-many-sub-items',
  INVALID_DATE: 'validation.invalid-date',
  INVALID_VAT_RATE: 'validation.invalid-vat-rate',
  /** Out of range on the IVA share. The message also states that blank is VAT_DEDUCTION_INHERITS_IRPF */
  INVALID_VAT_DEDUCTION_PERCENT: 'validation.invalid-vat-deduction-percent',
  INVALID_RETENTION_RATE: 'validation.invalid-retention-rate',
  NAME_REQUIRED: 'validation.name-required',
  NAME_TOO_LONG: 'validation.name-too-long',
  FULL_NAME_REQUIRED: 'validation.full-name-required',
  NIF_REQUIRED: 'validation.nif-required',
  PREFIX_REQUIRED: 'validation.prefix-required',
  INVALID_COLOR: 'validation.invalid-color',
  INVALID_MODELO_100_CASILLA: 'validation.invalid-modelo-100-casilla',
  INVALID_AMORTIZATION_GROUP: 'validation.invalid-amortization-group',
  INVALID_AMORTIZATION_COEFFICIENT: 'validation.invalid-amortization-coefficient',
  LINE_ITEMS_REQUIRED: 'validation.line-items-required',
  SELECT_PREFIX: 'validation.select-prefix',
  SELECT_CLIENT: 'validation.select-client',
  DATE_REQUIRED: 'validation.date-required',
  DAY_OF_WEEK_REQUIRED: 'validation.day-of-week-required',
  DAY_OF_MONTH_REQUIRED: 'validation.day-of-month-required',
  MONTH_REQUIRED: 'validation.month-required',
  AMOUNT_MISMATCH: 'validation.amount-mismatch',
  JUMP_NUMBER_POSITIVE: 'validation.jump-number-positive',
  DURATION_POSITIVE: 'validation.duration-positive',
  VOUCHER_TOTAL_POSITIVE: 'validation.voucher-total-positive',
  VOUCHER_UNITS_POSITIVE: 'validation.voucher-units-positive',
  MODELO_TYPE_MISMATCH: 'validation.modelo-type-mismatch',
  QUARTERLY_MISMATCH: 'validation.quarterly-mismatch',
  INVALID_MONTH_FORMAT: 'validation.invalid-month-format',
  END_DATE_BEFORE_START: 'validation.end-date-before-start',
  API_KEY_LENGTH: 'validation.api-key-length',
  API_KEY_FORMAT: 'validation.api-key-format',
  API_SECRET_LENGTH: 'validation.api-secret-length',
  API_SECRET_FORMAT: 'validation.api-secret-format',
  EXPEDIENTE_REQUIRED: 'validation.expediente-required',
  EXPEDIENTE_TOO_LONG: 'validation.expediente-too-long',
  LIQUIDACION_TOO_LONG: 'validation.liquidacion-too-long',
  INVALID_INTEREST_RATE: 'validation.invalid-interest-rate',
  FRACCIONES_REQUIRED: 'validation.fracciones-required',
  TOO_MANY_FRACCIONES: 'validation.too-many-fracciones',
  FRACCION_SEQUENCE_INVALID: 'validation.fraccion-sequence-invalid',
  FRACCION_TOTAL_MISMATCH: 'validation.fraccion-total-mismatch',
  DEFERRAL_TOTALS_MISMATCH: 'validation.deferral-totals-mismatch',
} as const;
