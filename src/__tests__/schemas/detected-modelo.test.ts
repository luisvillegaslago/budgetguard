/**
 * Unit tests for DetectedModeloRawSchema.
 * Validates the raw modelo-detection contract: euros→cents conversion, negative
 * (refund) amounts, dirty-string sanitisation, annual-quarter nulling, absent
 * fields defaulting to null, and confidence range enforcement.
 */

import { MODELO_TYPE } from '@/constants/finance';
import { DetectedModeloRawSchema } from '@/schemas/fiscal-document';

describe('DetectedModeloRawSchema', () => {
  describe('amount conversion', () => {
    it('converts euros to cents', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: 419.28,
        confidence: 0.95,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resultAmountCents).toBe(41928);
      }
    });

    it('keeps negative amounts (refund due)', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '130',
        fiscalYear: 2026,
        fiscalQuarter: 2,
        resultAmountEuros: -150.5,
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resultAmountCents).toBe(-15050);
      }
    });

    it('sanitises a dirty amount string "419,28 €"', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: '419,28 €',
        confidence: 0.8,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resultAmountCents).toBe(41928);
      }
    });

    it('maps a null amount to null cents', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 1,
        resultAmountEuros: null,
        confidence: 0.8,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resultAmountCents).toBeNull();
      }
    });
  });

  describe('annual quarter nulling', () => {
    it('forces fiscalQuarter to null for 390 even if provided', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '390',
        fiscalYear: 2025,
        fiscalQuarter: 4,
        resultAmountEuros: 0,
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modeloType).toBe(MODELO_TYPE.M390);
        expect(result.data.fiscalQuarter).toBeNull();
      }
    });

    it('forces fiscalQuarter to null for 100 even if provided', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '100',
        fiscalYear: 2025,
        fiscalQuarter: 2,
        resultAmountEuros: 1234.5,
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fiscalQuarter).toBeNull();
      }
    });

    it('preserves the quarter for quarterly modelos (303)', () => {
      const result = DetectedModeloRawSchema.safeParse({
        modeloType: '303',
        fiscalYear: 2026,
        fiscalQuarter: 3,
        resultAmountEuros: 10,
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fiscalQuarter).toBe(3);
      }
    });
  });

  describe('absent fields default to null', () => {
    it('defaults missing fields to null while keeping confidence', () => {
      const result = DetectedModeloRawSchema.safeParse({ confidence: 0.2 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modeloType).toBeNull();
        expect(result.data.fiscalYear).toBeNull();
        expect(result.data.fiscalQuarter).toBeNull();
        expect(result.data.resultAmountCents).toBeNull();
        expect(result.data.confidence).toBe(0.2);
      }
    });
  });

  describe('confidence range', () => {
    it('rejects confidence above 1', () => {
      const result = DetectedModeloRawSchema.safeParse({ confidence: 1.5 });

      expect(result.success).toBe(false);
    });

    it('rejects confidence below 0', () => {
      const result = DetectedModeloRawSchema.safeParse({ confidence: -0.1 });

      expect(result.success).toBe(false);
    });

    it('rejects a missing confidence', () => {
      const result = DetectedModeloRawSchema.safeParse({ modeloType: '303' });

      expect(result.success).toBe(false);
    });
  });
});
