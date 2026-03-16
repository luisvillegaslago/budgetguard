/**
 * BudgetGuard Transactions API
 * GET /api/transactions - List transactions for a month
 * POST /api/transactions - Create a new transaction
 */

import { SHARED_EXPENSE } from '@/constants/finance';
import { CreateTransactionSchema, TransactionFiltersSchema, validateRequest } from '@/schemas/transaction';
import { createTransaction, getTransactionsByMonth } from '@/services/database/TransactionRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { getCurrentMonth } from '@/utils/helpers';
import { eurosToCents } from '@/utils/money';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);

  const filters = {
    month: searchParams.get('month') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  };

  const validation = validateRequest(TransactionFiltersSchema, filters);
  if (!validation.success) return validationError(validation.errors);

  const month = validation.data.month ?? getCurrentMonth();
  const transactions = await getTransactionsByMonth(month, {
    type: validation.data.type,
    categoryId: validation.data.categoryId,
    status: validation.data.status,
  });

  return { data: transactions, meta: { month, count: transactions.length } };
}, 'GET /api/transactions');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(CreateTransactionSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const { amount, isShared, vatPercent, deductionPercent, vendorName, invoiceNumber, status, ...rest } =
    validation.data;

  // Convert euros to cents for storage
  const fullAmountCents = eurosToCents(amount);
  const sharedDivisor = isShared ? SHARED_EXPENSE.DIVISOR : SHARED_EXPENSE.DEFAULT_DIVISOR;

  // Math.ceil ensures user's part covers the rounding (101 -> 51, not 50)
  const effectiveAmount = isShared ? Math.ceil(fullAmountCents / sharedDivisor) : fullAmountCents;

  const transaction = await createTransaction({
    ...rest,
    amountCents: effectiveAmount,
    originalAmountCents: isShared ? fullAmountCents : null,
    sharedDivisor,
    description: rest.description ?? undefined,
    vatPercent: vatPercent ?? null,
    deductionPercent: deductionPercent ?? null,
    vendorName: vendorName ?? null,
    invoiceNumber: invoiceNumber ?? null,
    status,
  });

  return { data: transaction, status: 201 };
}, 'POST /api/transactions');
