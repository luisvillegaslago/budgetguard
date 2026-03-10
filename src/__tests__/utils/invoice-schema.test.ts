/**
 * Unit Tests: Invoice Zod Schemas
 * Tests validation rules for billing profile, prefixes, invoices, and line items
 */

import { INVOICE_STATUS, PAYMENT_METHOD } from '@/constants/finance';
import {
  BillingProfileSchema,
  CreateInvoicePrefixSchema,
  CreateInvoiceSchema,
  UpdateInvoiceStatusSchema,
} from '@/schemas/invoice';

// ── BillingProfileSchema ──

describe('BillingProfileSchema', () => {
  const validProfile = {
    fullName: 'Luis Villegas',
    nif: '23011109T',
    paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
  };

  it('should accept a valid minimal profile', () => {
    const result = BillingProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('should accept a full profile with all optional fields', () => {
    const result = BillingProfileSchema.safeParse({
      ...validProfile,
      address: 'C. Aviador Zorita 35',
      phone: '+34661274672',
      bankName: 'CaixaBank',
      iban: 'ES1234567890123456789012',
      swift: 'CAIXESBB',
      bankAddress: 'Madrid, Spain',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing fullName', () => {
    const result = BillingProfileSchema.safeParse({ ...validProfile, fullName: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing nif', () => {
    const result = BillingProfileSchema.safeParse({ ...validProfile, nif: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid payment method', () => {
    const result = BillingProfileSchema.safeParse({ ...validProfile, paymentMethod: 'bitcoin' });
    expect(result.success).toBe(false);
  });

  it('should accept all valid payment methods', () => {
    [PAYMENT_METHOD.BANK_TRANSFER, PAYMENT_METHOD.PAYPAL, PAYMENT_METHOD.OTHER].forEach((method) => {
      const result = BillingProfileSchema.safeParse({ ...validProfile, paymentMethod: method });
      expect(result.success).toBe(true);
    });
  });

  it('should accept nullable optional fields', () => {
    const result = BillingProfileSchema.safeParse({
      ...validProfile,
      address: null,
      phone: null,
      bankName: null,
    });
    expect(result.success).toBe(true);
  });
});

// ── CreateInvoicePrefixSchema ──

describe('CreateInvoicePrefixSchema', () => {
  it('should accept a valid prefix', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: 'dw' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prefix).toBe('DW'); // transformed to uppercase
      expect(result.data.nextNumber).toBe(1); // default
    }
  });

  it('should transform prefix to uppercase', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: 'rmci', nextNumber: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prefix).toBe('RMCI');
      expect(result.data.nextNumber).toBe(5);
    }
  });

  it('should reject empty prefix', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: '' });
    expect(result.success).toBe(false);
  });

  it('should reject prefix longer than 10 chars', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: 'ABCDEFGHIJK' });
    expect(result.success).toBe(false);
  });

  it('should reject nextNumber less than 1', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: 'DW', nextNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept optional companyId', () => {
    const result = CreateInvoicePrefixSchema.safeParse({ prefix: 'DW', companyId: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyId).toBe(3);
    }
  });
});

// ── CreateInvoiceSchema ──

describe('CreateInvoiceSchema', () => {
  const validInvoice = {
    prefixId: 1,
    invoiceDate: '2026-03-09',
    companyId: 2,
    lineItems: [{ description: 'Development services', hours: 10, hourlyRateCents: 6000, amountCents: 60000 }],
  };

  it('should accept a valid invoice', () => {
    const result = CreateInvoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
  });

  it('should accept multiple line items', () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      lineItems: [
        { description: 'Dev', hours: 10, hourlyRateCents: 6000, amountCents: 60000 },
        { description: 'Design', hours: 5, hourlyRateCents: 5000, amountCents: 25000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept line items without hours (fixed amount)', () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      lineItems: [{ description: 'Flat fee', amountCents: 50000 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject if amountCents does not match hours * rate', () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      lineItems: [{ description: 'Dev', hours: 10, hourlyRateCents: 6000, amountCents: 99999 }],
    });
    expect(result.success).toBe(false);
  });

  it('should validate amountCents = Math.round(hours * hourlyRateCents)', () => {
    // 3.5 hours * 4333 cents = 15165.5 → Math.round → 15166
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      lineItems: [{ description: 'Dev', hours: 3.5, hourlyRateCents: 4333, amountCents: 15166 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty line items', () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, lineItems: [] });
    expect(result.success).toBe(false);
  });

  it('should reject missing companyId', () => {
    const { companyId: _, ...noCompany } = validInvoice;
    const result = CreateInvoiceSchema.safeParse(noCompany);
    expect(result.success).toBe(false);
  });

  it('should coerce date strings to Date', () => {
    const result = CreateInvoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoiceDate).toBeInstanceOf(Date);
    }
  });

  it('should accept optional notes', () => {
    const result = CreateInvoiceSchema.safeParse({ ...validInvoice, notes: 'Payment due in 30 days' });
    expect(result.success).toBe(true);
  });

  it('should reject amountCents of 0', () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      lineItems: [{ description: 'Free', amountCents: 0 }],
    });
    expect(result.success).toBe(false);
  });
});

// ── UpdateInvoiceStatusSchema ──

describe('UpdateInvoiceStatusSchema', () => {
  it('should accept finalized status', () => {
    const result = UpdateInvoiceStatusSchema.safeParse({ status: INVOICE_STATUS.FINALIZED });
    expect(result.success).toBe(true);
  });

  it('should accept paid status with categoryId', () => {
    const result = UpdateInvoiceStatusSchema.safeParse({
      status: INVOICE_STATUS.PAID,
      categoryId: 5,
    });
    expect(result.success).toBe(true);
  });

  it('should accept cancelled status', () => {
    const result = UpdateInvoiceStatusSchema.safeParse({ status: INVOICE_STATUS.CANCELLED });
    expect(result.success).toBe(true);
  });

  it('should reject draft status (cannot transition to draft)', () => {
    const result = UpdateInvoiceStatusSchema.safeParse({ status: INVOICE_STATUS.DRAFT });
    expect(result.success).toBe(false);
  });

  it('should reject unknown status', () => {
    const result = UpdateInvoiceStatusSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });
});
