/**
 * BudgetGuard Invoice PDF Template
 * React-PDF document component for generating professional invoice PDFs
 * Layout based on DW-05/06 invoice format
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { INVOICE_STATUS, PAYMENT_METHOD } from '@/constants/finance';
import type { Invoice } from '@/types/finance';
import { getTaxBreakdownRows, isNotSubjectToVat } from '@/utils/invoiceAmounts';
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

/**
 * Width of every money column: the line item amounts, the tax breakdown and the total.
 * Sized to the widest realistic figure rather than to the "BALANCE" header — the values are
 * right-aligned, so any slack shows up as a gap between this column and the one before it.
 */
const AMOUNT_COLUMN_WIDTH = '12%';
/** What is left for the label that precedes an amount in the breakdown and total rows */
const LABEL_COLUMN_WIDTH = '88%';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 38,
    color: '#1e293b',
    backgroundColor: '#ffffff',
  },
  // Header section
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    paddingBottom: 10,
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
  draftNotice: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#dc2626',
    marginTop: 2,
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  // Column widths. The money columns are sized to their widest realistic value rather than to
  // their headers: right-aligned text in an oversized column reads as a gap between columns.
  // AMOUNT_COLUMN_WIDTH is shared with the subtotal/total rows so every figure lines up.
  colDescription: { width: '66%' },
  colHours: { width: '8%', textAlign: 'center' },
  colRate: { width: '14%', textAlign: 'right' },
  colAmount: { width: AMOUNT_COLUMN_WIDTH, textAlign: 'right' },
  colDescriptionFlat: { width: LABEL_COLUMN_WIDTH },
  colAmountFlat: { width: AMOUNT_COLUMN_WIDTH, textAlign: 'right' },
  cellText: {
    fontSize: 10,
    color: '#334155',
  },
  cellMuted: {
    fontSize: 10,
    color: '#94a3b8',
  },
  // Structured line item typography
  lineItemTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  subItemRow: {
    flexDirection: 'row',
    marginTop: 2,
    paddingLeft: 6,
  },
  subItemBullet: {
    fontSize: 9,
    color: '#64748b',
    width: 10,
  },
  subItemText: {
    fontSize: 9,
    color: '#475569',
    flex: 1,
    lineHeight: 1.4,
  },
  lineItemDescription: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 1.4,
  },
  // Tax breakdown
  subtotalRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  subtotalLabel: {
    width: LABEL_COLUMN_WIDTH,
    textAlign: 'right',
    fontSize: 9,
    color: '#475569',
    paddingRight: 10,
  },
  subtotalValue: {
    width: AMOUNT_COLUMN_WIDTH,
    textAlign: 'right',
    fontSize: 9,
    color: '#475569',
  },
  // Legal notice for operations not subject to Spanish VAT
  legalNotice: {
    marginTop: 10,
    paddingHorizontal: 10,
    fontSize: 8,
    color: '#64748b',
    lineHeight: 1.4,
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
    width: LABEL_COLUMN_WIDTH,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    paddingRight: 10,
  },
  totalValue: {
    width: AMOUNT_COLUMN_WIDTH,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  // Footer (payment info)
  footer: {
    marginTop: 20,
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
  // Notes — sit under the date/number block, where they read as context for the whole invoice
  notes: {
    flexDirection: 'row',
    marginTop: 10,
    fontSize: 9,
    color: '#64748b',
    lineHeight: 1.5,
  },
  notesLabel: {
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },
  // Separates the meta/notes header from the table when notes push them apart
  tableSpacer: {
    marginTop: 16,
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
            <Text style={styles.invoiceNumberValue}>{invoice.invoiceNumber ?? l.draft}</Text>
            {/*
              A draft reverted from finalized keeps its number, so the number alone no longer proves
              the invoice was issued — and while it stays draft it is out of vw_FiscalAccrual, so no
              tax return declares it. Mark the PDF so it can never pass for the issued document.
            */}
            {invoice.status === INVOICE_STATUS.DRAFT && invoice.invoiceNumber != null && (
              <Text style={styles.draftNotice}>{l.draft}</Text>
            )}
          </View>
        </View>

        {/* Notes — context for the whole invoice, so they precede the concepts they explain */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text>
              <Text style={styles.notesLabel}>{l.notes}: </Text>
              {invoice.notes}
            </Text>
          </View>
        )}

        {/* Table Header */}
        <View style={[styles.tableHeader, styles.tableSpacer]}>
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
          <View key={item.lineItemId} style={styles.tableRow} wrap={false}>
            <View style={showHourlyColumns ? styles.colDescription : styles.colDescriptionFlat}>
              {item.title && <Text style={styles.lineItemTitle}>{item.title}</Text>}
              {item.subItems.map((sub, idx) => (
                <View key={`${item.lineItemId}-sub-${idx}`} style={styles.subItemRow}>
                  <Text style={styles.subItemBullet}>•</Text>
                  <Text style={styles.subItemText}>{sub}</Text>
                </View>
              ))}
              {item.description && (
                <Text style={item.title || item.subItems.length > 0 ? styles.lineItemDescription : styles.cellText}>
                  {item.description}
                </Text>
              )}
            </View>
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

        {/* Tax breakdown — base, VAT and withholding, as RD 1619/2012 requires */}
        {getTaxBreakdownRows(invoice, l).map((row) => (
          <View key={row.key} style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>{row.label}</Text>
            <Text style={styles.subtotalValue}>
              {row.negative ? `-${formatPdfCurrency(row.cents)}` : formatPdfCurrency(row.cents)}
            </Text>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{l.total}</Text>
          <Text style={styles.totalValue}>{formatPdfCurrency(invoice.totalCents)}</Text>
        </View>

        {/* Legally required when the operation carries no Spanish VAT */}
        {isNotSubjectToVat(invoice.vatPercent) && (
          <View style={styles.legalNotice}>
            <Text>{l.notSubjectNotice}</Text>
          </View>
        )}

        {/* Footer: Payment Information. wrap={false} keeps the bank details from being split
            across pages, which would strand the IBAN on its own page. */}
        <View style={styles.footer} wrap={false}>
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
