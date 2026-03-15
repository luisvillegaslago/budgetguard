/**
 * Invoice Finalize Service
 * Orchestrates: validate → PDF → blob upload → transaction (fiscal doc + status update)
 */

import { put } from '@vercel/blob';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, INVOICE_STATUS } from '@/constants/finance';
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
  if (!check) throw new Error('Invoice not found');
  if (check.status !== INVOICE_STATUS.DRAFT) {
    throw new Error(`Cannot finalize invoice with status '${check.status}'`);
  }

  // 2. Generate PDF (handles snapshot refresh internally)
  const { invoice: current, pdfBuffer, fileName } = await prepareInvoicePdf(invoiceId);

  // 3. Upload to Vercel Blob (outside transaction — if this fails, invoice stays draft)
  const invoiceDate = new Date(current.invoiceDate);
  const fiscalYear = invoiceDate.getUTCFullYear();
  const fiscalQuarter = Math.ceil((invoiceDate.getUTCMonth() + 1) / 3);

  const blob = await put(`fiscal/${userId}/${fiscalYear}/${fileName}`, pdfBuffer, {
    access: 'private',
    addRandomSuffix: true,
  });

  // 4. Transaction: FiscalDocument INSERT + Invoice status UPDATE (atomic)
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 4a. Create FiscalDocument
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

    // 4b. Update invoice status to finalized
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

  // 5. Return PDF for immediate download
  const finalized = await getInvoiceById(invoiceId);
  return { pdfBuffer, fileName, invoice: finalized! };
}
