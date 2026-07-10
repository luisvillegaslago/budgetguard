/**
 * BudgetGuard Invoice Labels
 * Static translations for invoice rendering (PDF + detail preview)
 * Separate from app i18n — these follow the company's invoiceLanguage, not the UI locale
 */

export interface InvoiceLabels {
  billTo: string;
  date: string;
  invoiceNumber: string;
  description: string;
  hours: string;
  hourlyRate: string;
  balance: string;
  taxableBase: string;
  vat: string;
  retention: string;
  /** Required on invoices with no Spanish VAT: says why, and cites the article */
  notSubjectNotice: string;
  total: string;
  paymentMethod: string;
  bankTransfer: string;
  paypal: string;
  other: string;
  entityName: string;
  iban: string;
  swift: string;
  address: string;
  taxId: string;
}

const labels: Record<string, InvoiceLabels> = {
  en: {
    billTo: 'Bill To',
    date: 'Date',
    invoiceNumber: 'Invoice #',
    description: 'Description',
    hours: 'Hours',
    hourlyRate: 'Hourly Rate',
    balance: 'Balance',
    taxableBase: 'Taxable base',
    vat: 'VAT',
    retention: 'IRPF withholding',
    notSubjectNotice:
      'Operation not subject to Spanish VAT under the place-of-supply rules (art. 69.Uno.1º, Ley 37/1992).',
    total: 'Total',
    paymentMethod: 'Payment Method',
    bankTransfer: 'Bank Transfer',
    paypal: 'PayPal',
    other: 'Other',
    entityName: 'Entity',
    iban: 'IBAN',
    swift: 'SWIFT',
    address: 'Address',
    taxId: 'Tax ID',
  },
  es: {
    billTo: 'Facturar a',
    date: 'Fecha',
    invoiceNumber: 'Factura #',
    description: 'Descripción',
    hours: 'Horas',
    hourlyRate: 'Tarifa (€)',
    balance: 'Importe',
    taxableBase: 'Base imponible',
    vat: 'IVA',
    retention: 'Retención IRPF',
    notSubjectNotice: 'Operación no sujeta a IVA por reglas de localización (art. 69.Uno.1º, Ley 37/1992).',
    total: 'Total',
    paymentMethod: 'Método de Pago',
    bankTransfer: 'Transferencia Bancaria',
    paypal: 'PayPal',
    other: 'Otro',
    entityName: 'Entidad',
    iban: 'IBAN',
    swift: 'SWIFT',
    address: 'Dirección',
    taxId: 'NIF',
  },
};

const DEFAULT_LABELS = labels.es as InvoiceLabels;

const LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  es: 'es-ES',
};

export function getInvoiceLabels(lang?: string | null): InvoiceLabels {
  if (lang && lang in labels) return labels[lang] as InvoiceLabels;
  return DEFAULT_LABELS;
}

/** Format invoice number for display — returns the number or a dash for drafts without one */
export function formatInvoiceLabel(invoiceNumber: string | null): string {
  return invoiceNumber ?? '—';
}

/** Get the Intl locale string for a given invoice language code */
export function getInvoiceLocale(lang?: string | null): string {
  if (lang && lang in LOCALE_MAP) return LOCALE_MAP[lang] as string;
  return 'es-ES';
}
