/**
 * Unit tests for VatPoolOpeningSchema: the casilla 110 copied from AEAT's 1T draft.
 * The card's input also carries min="0", which stops a negative before the schema runs in a
 * browser, so the schema's own bounds are pinned here.
 */

import { VALIDATION_KEY, VAT_POOL } from '@/constants/finance';
import { VatPoolOpeningSchema } from '@/schemas/fiscal';

const messagesOf = (value: unknown) => {
  const result = VatPoolOpeningSchema.safeParse({ vatPoolOpening: value });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('VatPoolOpeningSchema', () => {
  it('accepts the balance AEAT prefilled, and zero after a refund', () => {
    expect(messagesOf(950.4)).toEqual([]);
    expect(messagesOf(0)).toEqual([]);
  });

  it('refuses a negative balance', () => {
    expect(messagesOf(-5)).toEqual([VALIDATION_KEY.AMOUNT_NON_NEGATIVE]);
  });

  it('refuses an empty field instead of saving it as zero', () => {
    expect(messagesOf(Number.NaN)).toEqual([VALIDATION_KEY.AMOUNT_NON_NEGATIVE]);
  });

  it('refuses a figure above the sanity ceiling', () => {
    expect(messagesOf(VAT_POOL.MAX_EUROS + 1)).toEqual([VALIDATION_KEY.AMOUNT_TOO_LARGE]);
  });
});
