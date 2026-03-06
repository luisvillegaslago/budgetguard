/**
 * Unit Tests: Fiscal Utilities & Schema
 * Tests computeFiscalFields() for Spanish tax calculations (Modelo 303 / 130)
 * and FiscalReportFiltersSchema Zod validation
 */

import { GASTOS_DIFICIL, VAT_RATE } from '@/constants/finance';
import { FiscalReportFiltersSchema } from '@/schemas/fiscal';
import type { FiscalComputedFields } from '@/types/finance';
import { calcGastosDificilCents, computeFiscalFields } from '@/utils/fiscal';

// ---------------------------------------------------------------------------
// computeFiscalFields
// ---------------------------------------------------------------------------

describe('computeFiscalFields', () => {
  describe('standard case — 21% IVA, 100% deduction', () => {
    it('should decompose 9671 cents (€96.71) into base, IVA and full deductibles', () => {
      const result = computeFiscalFields(9671, VAT_RATE.STANDARD, 100);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 7993,
        ivaCents: 1678,
        baseDeducibleCents: 7993,
        ivaDeducibleCents: 1678,
      });
    });

    it('should match the docstring example (7919 cents at 21% / 50%)', () => {
      const result = computeFiscalFields(7919, VAT_RATE.STANDARD, 50);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 6545,
        ivaCents: 1374,
        baseDeducibleCents: 3273,
        ivaDeducibleCents: 687,
      });
    });
  });

  describe('0% IVA — international / exempt invoice (Desygner)', () => {
    it('should set base equal to total and ivaCents to 0', () => {
      const result = computeFiscalFields(5000, VAT_RATE.EXEMPT, 100);

      expect(result.baseCents).toBe(5000);
      expect(result.ivaCents).toBe(0);
      expect(result.baseDeducibleCents).toBe(5000);
      expect(result.ivaDeducibleCents).toBe(0);
    });
  });

  describe('partial deduction — 50% (e.g. Vodafone phone bill)', () => {
    it('should halve both base and IVA deductible amounts', () => {
      // 4840 cents at 21% IVA, 50% deduction
      const result = computeFiscalFields(4840, VAT_RATE.STANDARD, 50);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 4000,
        ivaCents: 840,
        baseDeducibleCents: 2000,
        ivaDeducibleCents: 420,
      });
    });
  });

  describe('10% IVA — reduced rate', () => {
    it('should correctly extract 10% IVA from total', () => {
      // 11000 cents at 10% IVA → base = 10000, IVA = 1000
      const result = computeFiscalFields(11000, VAT_RATE.REDUCED, 100);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 10000,
        ivaCents: 1000,
        baseDeducibleCents: 10000,
        ivaDeducibleCents: 1000,
      });
    });
  });

  describe('0% deduction', () => {
    it('should return zero deductible amounts', () => {
      // 12100 cents (€121.00 = €100 base + €21 IVA), 0% deduction
      const result = computeFiscalFields(12100, VAT_RATE.STANDARD, 0);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 10000,
        ivaCents: 2100,
        baseDeducibleCents: 0,
        ivaDeducibleCents: 0,
      });
    });
  });

  describe('edge case — 0 amount', () => {
    it('should return all zeros', () => {
      const result = computeFiscalFields(0, VAT_RATE.STANDARD, 100);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 0,
        ivaCents: 0,
        baseDeducibleCents: 0,
        ivaDeducibleCents: 0,
      });
    });
  });

  describe('Math.round rounding consistency', () => {
    it('should round fractional cents consistently (9999 cents at 21% / 33%)', () => {
      // 9999 / 1.21 = 8263.636... → round → 8264
      // IVA = 9999 - 8264 = 1735
      // baseDeducible = 8264 * 33 / 100 = 2727.12 → round → 2727
      // ivaDeducible  = 1735 * 33 / 100 = 572.55  → round → 573
      const result = computeFiscalFields(9999, VAT_RATE.STANDARD, 33);

      expect(result).toEqual<FiscalComputedFields>({
        baseCents: 8264,
        ivaCents: 1735,
        baseDeducibleCents: 2727,
        ivaDeducibleCents: 573,
      });
    });

    it('should satisfy baseCents + ivaCents === fullAmountCents (identity property)', () => {
      const testCases = [
        { amount: 9671, vat: VAT_RATE.STANDARD },
        { amount: 5000, vat: VAT_RATE.EXEMPT },
        { amount: 11000, vat: VAT_RATE.REDUCED },
        { amount: 7919, vat: VAT_RATE.STANDARD },
        { amount: 1, vat: VAT_RATE.STANDARD },
        { amount: 99999, vat: VAT_RATE.STANDARD },
      ];

      testCases.forEach(({ amount, vat }) => {
        const result = computeFiscalFields(amount, vat, 100);
        expect(result.baseCents + result.ivaCents).toBe(amount);
      });
    });

    it('should satisfy deductibles <= base/IVA respectively', () => {
      const testCases = [
        { amount: 9999, vat: VAT_RATE.STANDARD, deduction: 33 },
        { amount: 7919, vat: VAT_RATE.STANDARD, deduction: 50 },
        { amount: 4840, vat: VAT_RATE.STANDARD, deduction: 75 },
        { amount: 11000, vat: VAT_RATE.REDUCED, deduction: 25 },
      ];

      testCases.forEach(({ amount, vat, deduction }) => {
        const result = computeFiscalFields(amount, vat, deduction);
        expect(result.baseDeducibleCents).toBeLessThanOrEqual(result.baseCents);
        expect(result.ivaDeducibleCents).toBeLessThanOrEqual(result.ivaCents);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// calcGastosDificilCents
// ---------------------------------------------------------------------------

describe('calcGastosDificilCents', () => {
  it('should return 5% of positive net income', () => {
    // 100,000 cents (€1,000) → 5% = 5,000 cents (€50)
    expect(calcGastosDificilCents(100_000)).toBe(5_000);
  });

  it('should return 0 when net income is 0', () => {
    expect(calcGastosDificilCents(0)).toBe(0);
  });

  it('should return 0 when net income is negative', () => {
    expect(calcGastosDificilCents(-50_000)).toBe(0);
  });

  it('should cap at 2,000€ (200,000 cents) annual maximum', () => {
    // 5,000,000 cents (€50,000) → 5% = 250,000 cents (€2,500) → capped at 200,000 (€2,000)
    expect(calcGastosDificilCents(5_000_000)).toBe(GASTOS_DIFICIL.MAX_CENTS);
  });

  it('should return exact cap when 5% equals the maximum', () => {
    // 4,000,000 cents (€40,000) → 5% = 200,000 cents (€2,000) = exactly the cap
    expect(calcGastosDificilCents(4_000_000)).toBe(GASTOS_DIFICIL.MAX_CENTS);
  });

  it('should return below cap when income is moderate', () => {
    // 3,000,000 cents (€30,000) → 5% = 150,000 cents (€1,500) < cap
    expect(calcGastosDificilCents(3_000_000)).toBe(150_000);
  });

  it('should match real Modelo 100/2024 data (C0222 = 1,888.88€)', () => {
    // Real data: ingresos = 44,639.58€, gastos = 6,862.04€
    // Diferencia = 37,777.54€ = 3,777,754 cents
    // 5% = 188,888 cents ≈ 1,888.88€ → rounds to 188,888
    const rendimiento = 3_777_754;
    const result = calcGastosDificilCents(rendimiento);
    expect(result).toBe(188_888);
  });

  it('should round fractional cents using Math.round', () => {
    // 33,333 cents → 5% = 1,666.65 → rounds to 1,667
    expect(calcGastosDificilCents(33_333)).toBe(1_667);
  });
});

// ---------------------------------------------------------------------------
// FiscalReportFiltersSchema
// ---------------------------------------------------------------------------

describe('FiscalReportFiltersSchema', () => {
  describe('valid inputs', () => {
    it('should accept numeric year and quarter', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: 1 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.year).toBe(2025);
        expect(result.data.quarter).toBe(1);
      }
    });

    it('should accept boundary year values (2020, 2100)', () => {
      const minResult = FiscalReportFiltersSchema.safeParse({ year: 2020, quarter: 1 });
      const maxResult = FiscalReportFiltersSchema.safeParse({ year: 2100, quarter: 4 });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('should accept all valid quarters (1–4)', () => {
      [1, 2, 3, 4].forEach((quarter) => {
        const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('coercion from strings', () => {
    it('should coerce string year and quarter to numbers', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: '2025', quarter: '3' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.year).toBe(2025);
        expect(result.data.quarter).toBe(3);
      }
    });
  });

  describe('invalid year', () => {
    it('should reject year below minimum (2019)', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2019, quarter: 1 });
      expect(result.success).toBe(false);
    });

    it('should reject year above maximum (2101)', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2101, quarter: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('invalid quarter', () => {
    it('should reject quarter 0', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject quarter 5', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: 5 });
      expect(result.success).toBe(false);
    });

    it('should reject negative quarter', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('missing fields', () => {
    it('should reject when year is missing', () => {
      const result = FiscalReportFiltersSchema.safeParse({ quarter: 1 });
      expect(result.success).toBe(false);
    });

    it('should reject when quarter is missing', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025 });
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = FiscalReportFiltersSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('non-numeric values', () => {
    it('should reject non-numeric year', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 'abc', quarter: 1 });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric quarter', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should reject float quarter', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025, quarter: 2.5 });
      expect(result.success).toBe(false);
    });

    it('should reject float year', () => {
      const result = FiscalReportFiltersSchema.safeParse({ year: 2025.5, quarter: 1 });
      expect(result.success).toBe(false);
    });
  });
});
