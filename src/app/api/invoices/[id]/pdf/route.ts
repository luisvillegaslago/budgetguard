/**
 * BudgetGuard Invoice PDF API
 * GET /api/invoices/[id]/pdf - Generate and download invoice PDF
 */

import type { DocumentProps } from '@react-pdf/renderer';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import React from 'react';
import { InvoicePdfDocument } from '@/components/invoices/InvoicePdfTemplate';
import { getInvoiceById } from '@/services/database/InvoiceRepository';
import { notFound, parseIdParam, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const invoiceId = parseIdParam(id);
  if (typeof invoiceId !== 'number') return invoiceId;

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) return notFound('Invoice not found');

  const element = React.createElement(InvoicePdfDocument, { invoice }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);

  const { NextResponse } = await import('next/server');
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}, 'GET /api/invoices/[id]/pdf');
