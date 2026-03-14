/**
 * Bulk OCR extraction for existing fiscal documents.
 * Downloads each document from Vercel Blob, runs Anthropic API OCR,
 * saves extracted data, and attempts to match with existing transactions in SQL.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=xxx DATABASE_URL=xxx BLOB_READ_WRITE_TOKEN=xxx npx tsx scripts/ocr-fiscal-docs.ts [--dry-run] [--limit=N] [--year=YYYY]
 */

import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';
import { ExtractedInvoiceRawSchema } from '../src/schemas/fiscal-document';

const RATE_LIMIT_MS = 500;

interface DocumentRow {
  DocumentID: number;
  BlobUrl: string;
  FileName: string;
  ContentType: string;
  DocumentType: string;
  UserID: string;
}

interface MatchRow {
  TransactionID: number;
  SharedDivisor: number;
}

interface CompanyRow {
  CompanyID: number;
  Name: string;
  TradingName: string | null;
}

const EXTRACTION_PROMPT = `You are an invoice data extraction assistant. Analyze this document and extract the following information as JSON.

Return ONLY a JSON object with these fields:
- totalAmountEuros: number (total amount in euros, REQUIRED)
- baseAmountEuros: number | null (base amount before tax)
- taxAmountEuros: number | null (tax/VAT amount)
- vatPercent: number | null (VAT percentage, e.g. 21)
- date: string | null (invoice date in YYYY-MM-DD format)
- vendor: string | null (vendor/company name)
- invoiceNumber: string | null (invoice or document number)
- description: string | null (brief description of what was purchased/billed)
- confidence: number (your confidence in the extraction, 0.0 to 1.0)

Rules:
- All amounts must be in euros (not cents)
- If you can see the total but not the breakdown, set baseAmountEuros and taxAmountEuros to null
- If the document is not an invoice/receipt, still try to extract what you can
- Set confidence lower if the document is blurry, partially visible, or you're unsure
- Return ONLY valid JSON, no markdown formatting or explanation`;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function getImageMediaType(contentType: string): ImageMediaType {
  const typeMap: Record<string, ImageMediaType> = {
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/png': 'image/png',
  };
  return typeMap[contentType] ?? 'image/jpeg';
}

interface GroupCandidateRow {
  TransactionID: number;
  AmountCents: number;
  OriginalAmountCents: number | null;
  TransactionGroupID: number | null;
}

/**
 * Find transactions from same vendor within ±3 days that sum to the invoice total.
 * If found, creates a group (or reuses existing) and returns the group ID.
 */
async function findOrCreateGroupMatch(
  pool: Pool,
  amountCents: number,
  transactionDate: string,
  companyId: number,
  userId: string,
): Promise<number | null> {
  const { rows } = await pool.query<GroupCandidateRow>(
    `SELECT "TransactionID", "AmountCents", "OriginalAmountCents", "TransactionGroupID"
     FROM "Transactions"
     WHERE "CompanyID" = $1
       AND "TransactionDate" BETWEEN ($2::date - INTERVAL '3 days') AND ($2::date + INTERVAL '3 days')
       AND "UserID" = $3
     ORDER BY "TransactionDate"`,
    [companyId, transactionDate, userId],
  );

  if (rows.length < 2) return null;

  // Sum original amounts (pre-shared)
  const totalOriginalCents = rows.reduce((sum, r) => sum + (r.OriginalAmountCents ?? r.AmountCents), 0);

  // Allow ±1 cent tolerance
  if (Math.abs(totalOriginalCents - amountCents) > 1) return null;

  // Reuse existing group if all transactions share one
  const existingGroupId = rows.find((r) => r.TransactionGroupID != null)?.TransactionGroupID;
  if (existingGroupId && rows.every((r) => r.TransactionGroupID === existingGroupId)) {
    return existingGroupId;
  }

  // Create new group
  const groupResult = await pool.query<{ TransactionGroupID: number }>(
    'INSERT INTO "TransactionGroups" ("UserID") VALUES ($1) RETURNING "TransactionGroupID"',
    [userId],
  );
  const groupId = groupResult.rows[0]?.TransactionGroupID;
  if (!groupId) return null;

  const transactionIds = rows.map((r) => r.TransactionID);
  await pool.query(
    'UPDATE "Transactions" SET "TransactionGroupID" = $1 WHERE "TransactionID" = ANY($2) AND "UserID" = $3',
    [groupId, transactionIds, userId],
  );

  return groupId;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const limitFlag = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitFlag ? Number.parseInt(limitFlag.split('=')[1] ?? '0', 10) : 0;
  const yearFlag = process.argv.find((arg) => arg.startsWith('--year='));
  const year = yearFlag ? Number.parseInt(yearFlag.split('=')[1] ?? '0', 10) : 0;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  if (!isDryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required (not needed for --dry-run)');
    process.exit(1);
  }
  if (!isDryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is required (not needed for --dry-run)');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const anthropic = isDryRun ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load companies for vendor matching
  const { rows: companies } = await pool.query<CompanyRow>(
    'SELECT "CompanyID", "Name", "TradingName" FROM "Companies" WHERE "IsActive" = true',
  );
  console.log(`Loaded ${companies.length} companies for vendor matching`);

  function findCompanyByVendor(vendor: string): CompanyRow | null {
    const vendorLower = vendor.toLowerCase();
    return (
      companies.find(
        (c) =>
          c.Name.toLowerCase().includes(vendorLower) ||
          vendorLower.includes(c.Name.toLowerCase()) ||
          (c.TradingName &&
            (c.TradingName.toLowerCase().includes(vendorLower) || vendorLower.includes(c.TradingName.toLowerCase()))),
      ) ?? null
    );
  }

  async function findCompanyWithAI(vendor: string): Promise<CompanyRow | null> {
    if (!anthropic || companies.length === 0) return null;

    const companyList = companies.map((c) => `${c.CompanyID}: ${c.Name}${c.TradingName ? ` (${c.TradingName})` : ''}`);
    const prompt = `The OCR detected this vendor on an invoice: "${vendor}"

These are the existing companies in the database:
${companyList.join('\n')}

Which company ID matches this vendor? Consider that vendor names on invoices may differ from the company name (e.g. legal name vs trading name, abbreviations, parent companies).

Reply with ONLY the numeric ID, or "none" if no match.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        response.content.find((b) => b.type === 'text')?.type === 'text'
          ? (response.content.find((b) => b.type === 'text') as { type: 'text'; text: string }).text.trim()
          : '';

      if (text === 'none' || !text) return null;

      const matchedId = Number.parseInt(text, 10);
      if (Number.isNaN(matchedId)) return null;

      return companies.find((c) => c.CompanyID === matchedId) ?? null;
    } catch {
      return null;
    }
  }

  let extracted = 0;
  let linked = 0;
  let companiesLinked = 0;
  let noMatch = 0;
  let errors = 0;

  try {
    const yearClause = year > 0 ? ` AND "FiscalYear" = ${year}` : '';
    const limitClause = limit > 0 ? ` LIMIT ${limit}` : '';
    const { rows: documents } = await pool.query<DocumentRow>(
      `SELECT "DocumentID", "BlobUrl", "FileName", "ContentType", "DocumentType", "UserID"
       FROM "FiscalDocuments"
       WHERE "ExtractionStatus" = 'not_extracted'
         AND "DocumentType" IN ('factura_recibida', 'factura_emitida')${yearClause}
       ORDER BY "DocumentID"${limitClause}`,
    );

    const flags = [isDryRun && 'DRY RUN', year > 0 && `YEAR ${year}`, limit > 0 && `LIMIT ${limit}`]
      .filter(Boolean)
      .join(', ');
    console.log(`Found ${documents.length} documents to process${flags ? ` (${flags})` : ''}`);

    let i = 0;
    const total = documents.length;

    const processDocument = async (doc: DocumentRow) => {
      i++;
      console.log(`\n[${i}/${total}] ${doc.FileName} (ID: ${doc.DocumentID}, type: ${doc.DocumentType})`);

      if (isDryRun) {
        console.log('  Would extract and attempt transaction match');
        extracted++;
        return;
      }

      try {
        // Download document from Vercel Blob
        const response = await fetch(doc.BlobUrl, {
          headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        });
        if (!response.ok) {
          console.error(`  Failed to download: HTTP ${response.status}`);
          errors++;
          return;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const base64Data = buffer.toString('base64');
        const isPdf = doc.ContentType === 'application/pdf';

        // OCR via Anthropic API
        const content: Anthropic.ContentBlockParam[] = isPdf
          ? [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
              { type: 'text', text: EXTRACTION_PROMPT },
            ]
          : [
              {
                type: 'image',
                source: { type: 'base64', media_type: getImageMediaType(doc.ContentType), data: base64Data },
              },
              { type: 'text', text: EXTRACTION_PROMPT },
            ];

        const aiResponse = await anthropic!.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content }],
        });

        const textBlock = aiResponse.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          console.error('  No text response from Claude');
          errors++;
          return;
        }

        let jsonText = textBlock.text.trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }

        const rawData = JSON.parse(jsonText);
        const validated = ExtractedInvoiceRawSchema.safeParse(rawData);
        if (!validated.success) {
          console.error(`  Validation failed: ${validated.error.message}`);
          errors++;
          return;
        }

        const data = validated.data;
        console.log(
          `  Extracted: ${data.totalAmountCents / 100}€, vendor: ${data.vendor}, date: ${data.date}, confidence: ${data.confidence}`,
        );

        // Match company: exact name first, then AI fallback
        let matchedCompany = data.vendor ? findCompanyByVendor(data.vendor) : null;
        if (matchedCompany) {
          console.log(`  Company: ${matchedCompany.Name}`);
        } else if (data.vendor) {
          matchedCompany = await findCompanyWithAI(data.vendor);
          if (matchedCompany) {
            console.log(`  Company (AI): ${matchedCompany.Name}`);
          }
        }
        await pool.query(
          `UPDATE "FiscalDocuments"
           SET "ExtractedData" = $1, "ExtractionStatus" = 'extracted'${matchedCompany ? ', "CompanyID" = $3' : ''}
           WHERE "DocumentID" = $2`,
          matchedCompany
            ? [JSON.stringify(data), doc.DocumentID, matchedCompany.CompanyID]
            : [JSON.stringify(data), doc.DocumentID],
        );
        extracted++;
        if (matchedCompany) {
          companiesLinked++;
        }

        // Try to match: 1) single transaction, 2) group of transactions from same vendor
        if (data.date && data.totalAmountCents) {
          const halfAmountCents = Math.round(data.totalAmountCents / 2);

          // 1. Single transaction match (exact or shared ÷2)
          const { rows: matches } = await pool.query<MatchRow>(
            `SELECT "TransactionID", "SharedDivisor" FROM "Transactions"
             WHERE ("AmountCents" = $1 OR ("AmountCents" = $4 AND "SharedDivisor" = 2))
               AND "TransactionDate" BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
               AND "UserID" = $3
             ORDER BY ABS("TransactionDate" - $2::date)
             LIMIT 1`,
            [data.totalAmountCents, data.date, doc.UserID, halfAmountCents],
          );

          if (matches.length > 0 && matches[0]) {
            await pool.query('UPDATE "FiscalDocuments" SET "TransactionID" = $1 WHERE "DocumentID" = $2', [
              matches[0].TransactionID,
              doc.DocumentID,
            ]);
            const shared = matches[0].SharedDivisor === 2 ? ' (shared ÷2)' : '';
            console.log(`  Linked to transaction ${matches[0].TransactionID}${shared}`);
            linked++;
          } else if (matchedCompany) {
            // 2. Group match: multiple transactions from same vendor summing to invoice total
            const groupId = await findOrCreateGroupMatch(
              pool,
              data.totalAmountCents,
              data.date,
              matchedCompany.CompanyID,
              doc.UserID,
            );
            if (groupId) {
              await pool.query(
                'UPDATE "FiscalDocuments" SET "TransactionGroupID" = $1 WHERE "DocumentID" = $2',
                [groupId, doc.DocumentID],
              );
              console.log(`  Linked to group ${groupId} (multi-transaction)`);
              linked++;
            } else {
              console.log('  No matching transaction found');
              noMatch++;
            }
          } else {
            console.log('  No matching transaction found');
            noMatch++;
          }
        } else {
          noMatch++;
        }
      } catch (err) {
        console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
        await pool.query(`UPDATE "FiscalDocuments" SET "ExtractionStatus" = 'failed' WHERE "DocumentID" = $1`, [
          doc.DocumentID,
        ]);
        errors++;
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
    };

    // Process sequentially
    await documents.reduce((chain, doc) => chain.then(() => processDocument(doc)), Promise.resolve());

    console.log('\n========================================');
    console.log('Summary:');
    console.log(`  Total processed: ${total}`);
    console.log(`  Extracted: ${extracted}`);
    console.log(`  Linked to transactions: ${linked}`);
    console.log(`  Linked to companies: ${companiesLinked}`);
    console.log(`  No match: ${noMatch}`);
    console.log(`  Errors: ${errors}`);
    if (isDryRun) console.log('  (DRY RUN — no changes made)');
    console.log('========================================');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
