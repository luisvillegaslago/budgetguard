/**
 * Invoice PDF generation utility
 * Single source of truth for PDF preparation, generation, and filename
 */

import type { DocumentProps } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import React from 'react';
import { InvoicePdfDocument } from '@/components/invoices/InvoicePdfTemplate';
import { INVOICE_STATUS } from '@/constants/finance';
import { getInvoiceById, refreshDraftSnapshot } from '@/services/database/InvoiceRepository';
import type { Invoice } from '@/types/finance';

export function getInvoicePdfFileName(invoiceNumber: string | null): string {
  return `invoice_${invoiceNumber ?? 'draft'}.pdf`;
}

interface InvoicePdfResult {
  invoice: Invoice;
  pdfBuffer: Buffer;
  fileName: string;
}

/**
 * Prepare and generate an invoice PDF.
 * Handles draft snapshot refresh and PDF rendering in one place.
 */
export async function prepareInvoicePdf(invoiceId: number): Promise<InvoicePdfResult> {
  let invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  // Draft invoices: refresh biller + client snapshot before generating PDF
  if (invoice.status === INVOICE_STATUS.DRAFT) {
    const refreshed = await refreshDraftSnapshot(invoiceId);
    if (refreshed) invoice = refreshed;
  }

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePdfDocument, { invoice }) as unknown as ReactElement<DocumentProps>,
  );
  const fileName = getInvoicePdfFileName(invoice.invoiceNumber);

  return { invoice, pdfBuffer, fileName };
}
