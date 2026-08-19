/**
 * Integration Tests: every carrier of a deduction share carries BOTH of them
 *
 * `computeFiscalFields()` now takes two percentages: the IRPF share ("DeductionPercent",
 * art. 30.2.5.ª b LIRPF) and the IVA one ("VatDeductionPercent", art. 95 LIVA — V2554-23,
 * TEAC 6654/2022). The maths is unit-tested elsewhere; what nothing covered is the plumbing
 * *upstream* of it, and that is where the defect would come back.
 *
 * The failure this file exists to catch is silent by construction. A repository, a route or the
 * recurring rule that copies the IRPF share and drops the IVA one leaves the row with a NULL, NULL
 * means "the same share as IRPF", and the expense goes back to deducting input VAT a comprobación
 * would disallow — with every other test still green, because the fallback is exactly what the app
 * did before the column existed. Only the write path can see it.
 *
 * Two shapes are asserted, and they answer different questions:
 *  - the writes bind each share to its own column (7,5 and 0 are never interchangeable, and two
 *    adjacent `number`s in a positional parameter list transpose without a type error);
 *  - the reads select the new column wherever they select the old one, since a share that is not
 *    read back is a share the forms cannot show and the next write silently discards.
 *
 * Postgres is faked and every statement captured, so this is the real SQL of the real functions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OCCURRENCE_STATUS,
  RECURRING_FREQUENCY,
  TRANSACTION_TYPE,
  VAT_DEDUCTION_PERCENT,
  VAT_RATE,
} from '@/constants/finance';

/**
 * The live case, and the whole reason the second column exists: the supplies of a home affected
 * at 25% deduct 30% × 25% = 7,5% in IRPF and nothing at all in IVA.
 */
const IRPF_SHARE = 7.5;

interface CapturedQuery {
  sql: string;
  params: unknown[];
}

const executed: CapturedQuery[] = [];

const TRANSACTION_ROW = {
  TransactionID: 100,
  CategoryID: 5,
  CategoryName: 'Suministros',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  ParentCategoryName: null,
  AmountCents: 4200,
  Description: 'Luz',
  TransactionDate: '2026-08-19',
  Type: TRANSACTION_TYPE.EXPENSE,
  SharedDivisor: 1,
  OriginalAmountCents: null,
  RecurringExpenseID: null,
  TransactionGroupID: null,
  TripID: null,
  TripName: null,
  VatPercent: VAT_RATE.STANDARD,
  DeductionPercent: IRPF_SHARE,
  VatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
  VendorName: null,
  InvoiceNumber: null,
  Status: 'paid',
  CompanyID: null,
  FiscalDocumentID: null,
  VoucherID: null,
  VoucherUnits: null,
  CreatedAt: '2026-08-19T00:00:00Z',
  UpdatedAt: '2026-08-19T00:00:00Z',
};

const RECURRING_ROW = {
  RecurringExpenseID: 7,
  CategoryID: 5,
  CategoryName: 'Suministros',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  AmountCents: 4200,
  Description: 'Luz',
  Frequency: RECURRING_FREQUENCY.MONTHLY,
  DayOfWeek: null,
  DayOfMonth: 1,
  MonthOfYear: null,
  StartDate: new Date('2026-01-01'),
  EndDate: null,
  IsActive: true,
  SharedDivisor: 1,
  OriginalAmountCents: null,
  VatPercent: VAT_RATE.STANDARD,
  DeductionPercent: IRPF_SHARE,
  VatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
  VendorName: null,
  CompanyID: null,
  CreatedAt: new Date('2026-01-01'),
  UpdatedAt: new Date('2026-01-01'),
};

/** One pending occurrence of the rule above, as the confirm query reads it back. */
const OCCURRENCE_ROW = {
  OccurrenceID: 42,
  RecurringExpenseID: 7,
  OccurrenceDate: new Date('2026-08-01'),
  Status: OCCURRENCE_STATUS.PENDING,
  TransactionID: null,
  ModifiedAmountCents: null,
  ProcessedAt: null,
  RE_CategoryID: 5,
  RE_CategoryName: 'Suministros',
  RE_CategoryIcon: null,
  RE_CategoryColor: null,
  RE_ParentCategoryID: null,
  RE_AmountCents: 4200,
  RE_Description: 'Luz',
  RE_Frequency: RECURRING_FREQUENCY.MONTHLY,
  RE_DayOfWeek: null,
  RE_DayOfMonth: 1,
  RE_MonthOfYear: null,
  RE_StartDate: new Date('2026-01-01'),
  RE_EndDate: null,
  RE_IsActive: true,
  RE_SharedDivisor: 1,
  RE_OriginalAmountCents: null,
  RE_VatPercent: VAT_RATE.STANDARD,
  RE_DeductionPercent: IRPF_SHARE,
  RE_VatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
  RE_VendorName: null,
  RE_CompanyID: null,
  RE_CreatedAt: new Date('2026-01-01'),
  RE_UpdatedAt: new Date('2026-01-01'),
};

const CATEGORY_ROW = {
  CategoryID: 5,
  Name: 'Suministros',
  Type: TRANSACTION_TYPE.EXPENSE,
  Icon: null,
  Color: null,
  SortOrder: 0,
  IsActive: true,
  ParentCategoryID: null,
  DefaultShared: false,
  DefaultVatPercent: VAT_RATE.STANDARD,
  DefaultDeductionPercent: IRPF_SHARE,
  DefaultVatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
  Modelo100CasillaCode: null,
};

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params?: unknown[]) => {
    executed.push({ sql, params: params ?? [] });

    if (sql.includes('INSERT INTO "Transactions"')) return [{ TransactionID: TRANSACTION_ROW.TransactionID }];
    if (sql.includes('INSERT INTO "RecurringExpenses"')) {
      return [{ RecurringExpenseID: RECURRING_ROW.RecurringExpenseID }];
    }
    if (sql.includes('"Categories"') && (sql.includes('INSERT INTO') || sql.includes('UPDATE'))) {
      return [CATEGORY_ROW];
    }
    if (sql.includes('FROM "RecurringExpenseOccurrences"')) return [OCCURRENCE_ROW];
    if (sql.includes('FROM "RecurringExpenses" re')) return [RECURRING_ROW];
    if (sql.includes('FROM "Transactions" t')) return [TRANSACTION_ROW];
    if (sql.includes('FROM "Categories"')) return [CATEGORY_ROW];
    return [];
  }),
  getPool: jest.fn(),
}));

jest.mock('@/libs/auth', () => ({ getUserIdOrThrow: jest.fn(async () => 2) }));

import { createCategory, updateCategory } from '@/services/database/CategoryRepository';
import {
  confirmOccurrence,
  createRecurringExpense,
  updateRecurringExpense,
} from '@/services/database/RecurringExpenseRepository';
import { createTransaction, updateTransaction } from '@/services/database/TransactionRepository';

/** The INSERT that wrote `table`, or a failure naming it. */
function insertInto(table: string): CapturedQuery {
  const insert = executed.find((q) => q.sql.includes(`INSERT INTO "${table}"`));
  if (!insert) throw new Error(`No INSERT INTO "${table}" was executed`);
  return insert;
}

/**
 * Reads a bound parameter by the column it sits under in the INSERT's own column list.
 *
 * Resolving the position from the SQL rather than counting by hand is what makes a transposition
 * visible: swapping two values in the parameter array moves them under each other's column here.
 */
function boundValue(table: string, column: string): unknown {
  const insert = insertInto(table);
  const columnList = insert.sql.slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf('VALUES'));
  const columns = columnList
    .split(',')
    .map((name) => name.trim().replace(/[")(]/g, ''))
    .filter((name) => name.length > 0);

  const index = columns.indexOf(column);
  if (index === -1) throw new Error(`Column ${column} is not in the INSERT INTO "${table}"`);

  return insert.params[index];
}

/** The UPDATE against `table`, or a failure naming it. */
function updateOf(table: string): CapturedQuery {
  const update = executed.find((q) => q.sql.includes(`UPDATE "${table}"`) && q.sql.includes('SET'));
  if (!update) throw new Error(`No UPDATE "${table}" was executed`);
  return update;
}

/** The value bound to `"Column" = $n` in a partial UPDATE, resolved through its own $n. */
function updatedValue(table: string, column: string): unknown {
  const update = updateOf(table);
  const match = new RegExp(`"${column}" = \\$(\\d+)`).exec(update.sql);
  if (!match) throw new Error(`Column ${column} is not in the UPDATE "${table}"`);

  return update.params[Number(match[1]) - 1];
}

beforeEach(() => {
  executed.length = 0;
});

describe('the write path binds each share to its own column', () => {
  it('createTransaction persists the IRPF share and the IVA share separately', async () => {
    await createTransaction({
      categoryId: 5,
      amountCents: 4200,
      transactionDate: new Date('2026-08-19'),
      type: TRANSACTION_TYPE.EXPENSE,
      vatPercent: VAT_RATE.STANDARD,
      deductionPercent: IRPF_SHARE,
      vatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
    });

    expect(boundValue('Transactions', 'DeductionPercent')).toBe(IRPF_SHARE);
    expect(boundValue('Transactions', 'VatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });

  it('createTransaction leaves the IVA share NULL when it is not given — never 0', async () => {
    await createTransaction({
      categoryId: 5,
      amountCents: 4200,
      transactionDate: new Date('2026-08-19'),
      type: TRANSACTION_TYPE.EXPENSE,
      deductionPercent: 100,
    });

    // NULL is VAT_DEDUCTION_INHERITS_IRPF, resolved by vw_FiscalQuarterly onto "DeductionPercent".
    // A 0 written here would erase the input VAT of every row created without the field.
    expect(boundValue('Transactions', 'VatDeductionPercent')).toBeNull();
  });

  it('updateTransaction writes an explicit 0 rather than treating it as "unset"', async () => {
    await updateTransaction(100, { vatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE });

    expect(updatedValue('Transactions', 'VatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });

  it('createRecurringExpense persists both shares on the rule', async () => {
    await createRecurringExpense({
      categoryId: 5,
      amountCents: 4200,
      frequency: RECURRING_FREQUENCY.MONTHLY,
      startDate: new Date('2026-01-01'),
      vatPercent: VAT_RATE.STANDARD,
      deductionPercent: IRPF_SHARE,
      vatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
    });

    expect(boundValue('RecurringExpenses', 'DeductionPercent')).toBe(IRPF_SHARE);
    expect(boundValue('RecurringExpenses', 'VatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });

  it('updateRecurringExpense can set the IVA share on its own', async () => {
    await updateRecurringExpense(7, { vatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE });

    expect(updatedValue('RecurringExpenses', 'VatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });

  it('createCategory persists both defaults', async () => {
    await createCategory({
      name: 'Suministros',
      type: TRANSACTION_TYPE.EXPENSE,
      defaultVatPercent: VAT_RATE.STANDARD,
      defaultDeductionPercent: IRPF_SHARE,
      defaultVatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE,
    });

    expect(boundValue('Categories', 'DefaultDeductionPercent')).toBe(IRPF_SHARE);
    expect(boundValue('Categories', 'DefaultVatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });

  it('updateCategory can set the IVA default on its own', async () => {
    await updateCategory(5, { defaultVatDeductionPercent: VAT_DEDUCTION_PERCENT.NONE });

    expect(updatedValue('Categories', 'DefaultVatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });
});

describe('a recurring rule stamps both shares onto every occurrence it generates', () => {
  /**
   * The live case is recurring — Internet, Luz, Calefacción — so a confirm that copied only the
   * IRPF share would re-create the defect every month, on rows nobody re-codes by hand.
   */
  it('confirmOccurrence carries the rule IVA share onto the generated movement', async () => {
    await confirmOccurrence(OCCURRENCE_ROW.OccurrenceID);

    expect(boundValue('Transactions', 'DeductionPercent')).toBe(IRPF_SHARE);
    expect(boundValue('Transactions', 'VatDeductionPercent')).toBe(VAT_DEDUCTION_PERCENT.NONE);
  });
});

describe('the read path selects the new column wherever it selects the old one', () => {
  const repositorySource = (file: string): string =>
    readFileSync(join(process.cwd(), 'src', 'services', 'database', file), 'utf-8');

  /** Statement-sized chunks, so "somewhere else in the file" cannot satisfy a per-SELECT check. */
  const selectListsNaming = (source: string, column: string): string[] =>
    source
      .split(/SELECT/i)
      .slice(1)
      .filter((chunk) => chunk.includes(column));

  it('every transaction SELECT that reads the IRPF share also reads the IVA one', () => {
    const source = repositorySource('TransactionRepository.ts');
    const lists = selectListsNaming(source, 't."DeductionPercent"');

    expect(lists.length).toBeGreaterThan(0);
    lists.forEach((list) => {
      expect(list).toContain('t."VatDeductionPercent"');
    });
  });

  it('every recurring-expense SELECT that reads the IRPF share also reads the IVA one', () => {
    const source = repositorySource('RecurringExpenseRepository.ts');
    const lists = selectListsNaming(source, 're."DeductionPercent"');

    expect(lists.length).toBeGreaterThan(0);
    lists.forEach((list) => {
      expect(list).toContain('re."VatDeductionPercent"');
    });
  });

  it('the category column fragment names both defaults, and every read interpolates it', () => {
    const source = repositorySource('CategoryRepository.ts');
    const fragment = /const CATEGORY_COLUMNS = `([\s\S]*?)`;/.exec(source)?.[1];

    expect(fragment).toContain('"DefaultDeductionPercent"');
    expect(fragment).toContain('"DefaultVatDeductionPercent"');

    // List, by id, INSERT RETURNING and UPDATE RETURNING — none of them spells its own column
    // list, so a fiscal default cannot reach three of the four and be NULL in the fourth.
    expect(source.match(/(?:SELECT|RETURNING) \$\{CATEGORY_COLUMNS\}/g)).toHaveLength(4);
  });
});
