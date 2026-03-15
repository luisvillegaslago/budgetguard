/**
 * Invoice Finalize Service
 * Orchestrates: validate → PDF → blob upload → transaction (fiscal doc + status update)
 */

import { put } from '@vercel/blob';
import { API_ERROR, FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, INVOICE_STATUS } from '@/constants/finance';
import { getUserIdOrThrow } from '@/libs/auth';
import { getPool } from '@/services/database/connection';
import { getInvoiceById } from '@/services/database/InvoiceRepository';
import type { Invoice } from '@/types/finance';
import { prepareInvoicePdf } from '@/utils/invoicePdf';

interface FinalizeResult {
  pdfBuffer: Buffer;
  fileName: string;
  invoice: Invoice;
}

export async function finalizeInvoice(invoiceId: number): Promise<FinalizeResult> {
  const userId = await getUserIdOrThrow();

  // 1. Validate status before generating PDF
  const check = await getInvoiceById(invoiceId);
  if (!check) throw new Error(API_ERROR.NOT_FOUND.INVOICE);
  if (check.status !== INVOICE_STATUS.DRAFT) {
    throw new Error(API_ERROR.INVOICE.CANNOT_FINALIZE);
  }

  // 2. Set invoice date to today before generating PDF
  const today = new Date().toISOString().split('T')[0]!;
  const pool = getPool();
  await pool.query(`UPDATE "Invoices" SET "InvoiceDate" = $1 WHERE "InvoiceID" = $2 AND "UserID" = $3`, [
    today,
    invoiceId,
    userId,
  ]);

  // 3. Generate PDF (handles snapshot refresh internally)
  const { invoice: current, pdfBuffer, fileName } = await prepareInvoicePdf(invoiceId);

  // 4. Upload to Vercel Blob (outside transaction — if this fails, invoice stays draft)
  const invoiceDate = new Date(today);
  const fiscalYear = invoiceDate.getUTCFullYear();
  const fiscalQuarter = Math.ceil((invoiceDate.getUTCMonth() + 1) / 3);

  const blob = await put(`fiscal/${userId}/${fiscalYear}/${fileName}`, pdfBuffer, {
    access: 'private',
    addRandomSuffix: true,
  });

  // 5. Transaction: FiscalDocument INSERT + Invoice status UPDATE (atomic)
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 5a. Create FiscalDocument
    const displayName = `${current.clientName} - ${current.invoiceDate}${fileName.slice(fileName.lastIndexOf('.'))}`;
    await client.query(
      `INSERT INTO "FiscalDocuments" (
        "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
        "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
        "ContentType", "TaxAmountCents", "TransactionID", "TransactionGroupID",
        "CompanyID", "Description", "DisplayName"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        userId,
        FISCAL_DOCUMENT_TYPE.FACTURA_EMITIDA,
        null,
        fiscalYear,
        fiscalQuarter,
        FISCAL_STATUS.FILED,
        blob.url,
        blob.pathname,
        fileName,
        pdfBuffer.byteLength,
        'application/pdf',
        current.totalCents,
        null,
        null,
        current.companyId,
        `Factura ${current.invoiceNumber} - ${current.clientName}`,
        displayName,
      ],
    );

    // 5b. Update invoice status to finalized
    await client.query(`UPDATE "Invoices" SET "Status" = $1 WHERE "InvoiceID" = $2 AND "UserID" = $3`, [
      INVOICE_STATUS.FINALIZED,
      invoiceId,
      userId,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // 6. Return PDF for immediate download
  const finalized = await getInvoiceById(invoiceId);
  return { pdfBuffer, fileName, invoice: finalized! };
}
