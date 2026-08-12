/**
 * Unit Tests: Invoice Labels & Locale
 * Tests getInvoiceLabels() and getInvoiceLocale() utilities
 */

import { formatInvoiceLabel, getInvoiceLabels, getInvoiceLocale } from '@/utils/invoiceLabels';

describe('formatInvoiceLabel', () => {
  it('should return the number once the invoice has one', () => {
    expect(formatInvoiceLabel('2026/014')).toBe('2026/014');
  });

  it('should prefer the number over the draft name', () => {
    expect(formatInvoiceLabel('2026/014', 'Acme kitchen refit')).toBe('2026/014');
  });

  it('should fall back to the draft name while there is no number', () => {
    expect(formatInvoiceLabel(null, 'Acme kitchen refit')).toBe('Acme kitchen refit');
  });

  it('should trim the draft name', () => {
    expect(formatInvoiceLabel(null, '  Acme  ')).toBe('Acme');
  });

  it('should return a dash for a blank or missing draft name', () => {
    expect(formatInvoiceLabel(null)).toBe('—');
    expect(formatInvoiceLabel(null, null)).toBe('—');
    expect(formatInvoiceLabel(null, '   ')).toBe('—');
  });
});

describe('getInvoiceLabels', () => {
  it('should return Spanish labels by default', () => {
    const labels = getInvoiceLabels();
    expect(labels.billTo).toBe('Facturar a');
    expect(labels.total).toBe('Total');
    expect(labels.taxId).toBe('NIF');
  });

  it('should return Spanish labels for null', () => {
    const labels = getInvoiceLabels(null);
    expect(labels.billTo).toBe('Facturar a');
  });

  it('should return Spanish labels for "es"', () => {
    const labels = getInvoiceLabels('es');
    expect(labels.billTo).toBe('Facturar a');
    expect(labels.hourlyRate).toBe('Tarifa (€)');
    expect(labels.bankTransfer).toBe('Transferencia Bancaria');
  });

  it('should return English labels for "en"', () => {
    const labels = getInvoiceLabels('en');
    expect(labels.billTo).toBe('Bill To');
    expect(labels.hourlyRate).toBe('Hourly Rate');
    expect(labels.bankTransfer).toBe('Bank Transfer');
    expect(labels.taxId).toBe('Tax ID');
  });

  it('should return default (Spanish) for unknown language', () => {
    const labels = getInvoiceLabels('fr');
    expect(labels.billTo).toBe('Facturar a');
  });

  it('should return all required label keys', () => {
    const labels = getInvoiceLabels('en');
    const expectedKeys = [
      'billTo',
      'date',
      'invoiceNumber',
      'description',
      'hours',
      'hourlyRate',
      'balance',
      'total',
      'paymentMethod',
      'bankTransfer',
      'paypal',
      'other',
      'entityName',
      'iban',
      'swift',
      'address',
      'taxId',
    ];
    expectedKeys.forEach((key) => {
      expect(labels).toHaveProperty(key);
      expect(typeof labels[key as keyof typeof labels]).toBe('string');
    });
  });
});

describe('getInvoiceLocale', () => {
  it('should return es-ES by default', () => {
    expect(getInvoiceLocale()).toBe('es-ES');
  });

  it('should return es-ES for null', () => {
    expect(getInvoiceLocale(null)).toBe('es-ES');
  });

  it('should return es-ES for "es"', () => {
    expect(getInvoiceLocale('es')).toBe('es-ES');
  });

  it('should return en-GB for "en"', () => {
    expect(getInvoiceLocale('en')).toBe('en-GB');
  });

  it('should return es-ES for unknown language', () => {
    expect(getInvoiceLocale('fr')).toBe('es-ES');
  });
});
