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

interface PrepareInvoicePdfOptions {
  /**
   * Render the invoice as issued even though its row still reads `draft`.
   *
   * Finalization assigns the number and renders the PDF *before* it commits the status change,
   * so at render time the row is a numbered draft — which is exactly what the template marks as
   * "not issued". Without this the archived document, which is the fiscal evidence for the
   * invoice, would be stamped as a draft the moment it is issued.
   */
  renderAsIssued?: boolean;
}

/**
 * Prepare and generate an invoice PDF.
 * Handles draft snapshot refresh and PDF rendering in one place.
 */
export async function prepareInvoicePdf(
  invoiceId: number,
  { renderAsIssued = false }: PrepareInvoicePdfOptions = {},
): Promise<InvoicePdfResult> {
  let invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  // Draft invoices: refresh biller + client snapshot before generating PDF
  if (invoice.status === INVOICE_STATUS.DRAFT) {
    const refreshed = await refreshDraftSnapshot(invoiceId);
    if (refreshed) invoice = refreshed;
  }

  // Only the rendered copy carries the override — the returned invoice stays the row as stored,
  // because the caller books fiscal data from it and must not read a status that is not committed.
  const rendered = renderAsIssued ? { ...invoice, status: INVOICE_STATUS.FINALIZED } : invoice;

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePdfDocument, { invoice: rendered }) as unknown as ReactElement<DocumentProps>,
  );
  const fileName = getInvoicePdfFileName(invoice.invoiceNumber);

  return { invoice, pdfBuffer, fileName };
}
