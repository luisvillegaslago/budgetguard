/**
 * BudgetGuard Invoice PDF Template
 * React-PDF document component for generating professional invoice PDFs
 * Layout based on DW-05/06 invoice format
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { PAYMENT_METHOD } from '@/constants/finance';
import type { Invoice } from '@/types/finance';
import { getInvoiceLabels, getInvoiceLocale } from '@/utils/invoiceLabels';
import { centsToEuros } from '@/utils/money';

function formatPdfCurrency(cents: number): string {
  const euros = centsToEuros(cents);
  return `${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros)} €`;
}

function formatPdfDate(dateStr: string, locale = 'es-ES'): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatPdfRate(cents: number): string {
  const euros = centsToEuros(cents);
  return `${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros)} €/hr`;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 50,
    color: '#1e293b',
    backgroundColor: '#ffffff',
  },
  // Header section
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  billerSection: {
    maxWidth: '50%',
  },
  billerName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  billerDetail: {
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.5,
  },
  clientSection: {
    maxWidth: '45%',
    textAlign: 'right',
  },
  billToLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  clientDetail: {
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.5,
  },
  // Meta section (date + invoice number)
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  metaBlock: {},
  metaLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  invoiceNumberValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#4f46e5',
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  colDescription: { width: '45%' },
  colHours: { width: '15%', textAlign: 'center' },
  colRate: { width: '20%', textAlign: 'right' },
  colAmount: { width: '20%', textAlign: 'right' },
  colDescriptionFlat: { width: '75%' },
  colAmountFlat: { width: '25%', textAlign: 'right' },
  cellText: {
    fontSize: 10,
    color: '#334155',
  },
  cellMuted: {
    fontSize: 10,
    color: '#94a3b8',
  },
  // Total
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#334155',
  },
  totalLabel: {
    width: '80%',
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    paddingRight: 10,
  },
  totalValue: {
    width: '20%',
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  // Footer (payment info)
  footer: {
    marginTop: 40,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  footerTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerDetail: {
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.6,
  },
  footerLabel: {
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },
  // Notes
  notes: {
    marginTop: 20,
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.5,
  },
});

interface InvoicePdfDocumentProps {
  invoice: Invoice;
}

export function InvoicePdfDocument({ invoice }: InvoicePdfDocumentProps) {
  const l = getInvoiceLabels(invoice.invoiceLanguage);
  const invoiceLocale = getInvoiceLocale(invoice.invoiceLanguage);
  const showHourlyColumns = invoice.lineItems.some((item) => item.hours != null || item.hourlyRateCents != null);

  const paymentLabel =
    invoice.billerPaymentMethod === PAYMENT_METHOD.BANK_TRANSFER
      ? l.bankTransfer
      : invoice.billerPaymentMethod === PAYMENT_METHOD.PAYPAL
        ? l.paypal
        : l.other;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: Biller + Client */}
        <View style={styles.headerContainer}>
          <View style={styles.billerSection}>
            <Text style={styles.billerName}>{invoice.billerName}</Text>
            <Text style={styles.billerDetail}>NIF: {invoice.billerNif}</Text>
            {invoice.billerAddress && <Text style={styles.billerDetail}>{invoice.billerAddress}</Text>}
            {invoice.billerPhone && <Text style={styles.billerDetail}>{invoice.billerPhone}</Text>}
          </View>

          <View style={styles.clientSection}>
            <Text style={styles.billToLabel}>{l.billTo}</Text>
            <Text style={styles.clientName}>{invoice.clientName}</Text>
            {invoice.clientTradingName && <Text style={styles.clientDetail}>{invoice.clientTradingName.trim()}</Text>}
            {invoice.clientAddress && <Text style={styles.clientDetail}>{invoice.clientAddress.trim()}</Text>}
            {(invoice.clientCity || invoice.clientPostalCode) && (
              <Text style={styles.clientDetail}>
                {[invoice.clientPostalCode, invoice.clientCity]
                  .filter(Boolean)
                  .map((s) => s?.trim())
                  .join(' ')}
              </Text>
            )}
            {invoice.clientCountry && <Text style={styles.clientDetail}>{invoice.clientCountry.trim()}</Text>}
            {invoice.clientTaxId && (
              <Text style={styles.clientDetail}>
                {l.taxId}: {invoice.clientTaxId.trim()}
              </Text>
            )}
          </View>
        </View>

        {/* Meta: Date + Invoice Number */}
        <View style={styles.metaContainer}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{l.date}</Text>
            <Text style={styles.metaValue}>{formatPdfDate(invoice.invoiceDate, invoiceLocale)}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{l.invoiceNumber}</Text>
            <Text style={styles.invoiceNumberValue}>{invoice.invoiceNumber ?? 'BORRADOR'}</Text>
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, showHourlyColumns ? styles.colDescription : styles.colDescriptionFlat]}>
            {l.description}
          </Text>
          {showHourlyColumns && (
            <>
              <Text style={[styles.tableHeaderText, styles.colHours]}>{l.hours}</Text>
              <Text style={[styles.tableHeaderText, styles.colRate]}>{l.hourlyRate}</Text>
            </>
          )}
          <Text style={[styles.tableHeaderText, showHourlyColumns ? styles.colAmount : styles.colAmountFlat]}>
            {l.balance}
          </Text>
        </View>

        {/* Table Rows */}
        {invoice.lineItems.map((item) => (
          <View key={item.lineItemId} style={styles.tableRow}>
            <Text style={[styles.cellText, showHourlyColumns ? styles.colDescription : styles.colDescriptionFlat]}>
              {item.description}
            </Text>
            {showHourlyColumns && (
              <>
                <Text style={[item.hours != null ? styles.cellText : styles.cellMuted, styles.colHours]}>
                  {item.hours != null ? item.hours.toString() : '-'}
                </Text>
                <Text style={[item.hourlyRateCents != null ? styles.cellText : styles.cellMuted, styles.colRate]}>
                  {item.hourlyRateCents != null ? formatPdfRate(item.hourlyRateCents) : '-'}
                </Text>
              </>
            )}
            <Text style={[styles.cellText, showHourlyColumns ? styles.colAmount : styles.colAmountFlat]}>
              {formatPdfCurrency(item.amountCents)}
            </Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{l.total}</Text>
          <Text style={styles.totalValue}>{formatPdfCurrency(invoice.totalCents)}</Text>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer: Payment Information */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>
            {l.paymentMethod}: {paymentLabel}
          </Text>
          {invoice.billerPaymentMethod === PAYMENT_METHOD.BANK_TRANSFER && (
            <View>
              {invoice.billerBankName && (
                <Text style={styles.footerDetail}>
                  <Text style={styles.footerLabel}>{l.entityName}: </Text>
                  {invoice.billerBankName}
                </Text>
              )}
              {invoice.billerIban && (
                <Text style={styles.footerDetail}>
                  <Text style={styles.footerLabel}>{l.iban}: </Text>
                  {invoice.billerIban}
                </Text>
              )}
              {invoice.billerSwift && (
                <Text style={styles.footerDetail}>
                  <Text style={styles.footerLabel}>{l.swift}: </Text>
                  {invoice.billerSwift}
                </Text>
              )}
              {invoice.billerBankAddress && (
                <Text style={styles.footerDetail}>
                  <Text style={styles.footerLabel}>{l.address}: </Text>
                  {invoice.billerBankAddress}
                </Text>
              )}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
