/**
 * GET /api/crypto/fiscal/export?year=YYYY
 *
 * CSV export of every CryptoDisposal for the requested fiscal year. Used
 * as a backup that the user can keep alongside the Renta Web filing in
 * case AEAT asks for justification during an inspection.
 *
 * One row per disposal — the AcquisitionLots breakdown is summarised as a
 * count (the full per-lot detail stays inside the UI under the expand
 * button).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/schemas/transaction';
import { listDisposals } from '@/services/database/CryptoFiscalRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

const HEADERS = [
  'DisposalID',
  'FiscalYear',
  'OccurredAt',
  'Asset',
  'Contraprestacion',
  'QuantityNative',
  'TransmissionValueCents',
  'TransmissionFeeCents',
  'AcquisitionValueCents',
  'AcquisitionFeeCents',
  'GainLossCents',
  'LotsConsumed',
] as const;

export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const validation = validateRequest(QuerySchema, { year: url.searchParams.get('year') });
  if (!validation.success) return validationError(validation.errors);

  const { year } = validation.data;

  // Pull everything in one shot — even at 10k disposals/year this stays
  // well within Postgres + Vercel response limits (a row is ~200 bytes).
  const { disposals } = await listDisposals({ year, limit: 10_000, offset: 0 });

  const rows = disposals.map((d) => [
    d.disposalId,
    String(d.fiscalYear),
    d.occurredAt,
    d.asset,
    d.contraprestacion,
    d.quantityNative,
    String(d.transmissionValueCents),
    String(d.transmissionFeeCents),
    String(d.acquisitionValueCents),
    String(d.acquisitionFeeCents),
    String(d.gainLossCents),
    String(d.acquisitionLots.length),
  ]);

  const csv = [HEADERS, ...rows].map((row) => row.map(escapeCsvField).join(',')).join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="crypto-disposals-${year}.csv"`,
    },
  });
}, 'GET /api/crypto/fiscal/export');

/**
 * Quote a CSV field if it contains a delimiter, quote or newline. Doubles
 * any embedded quotes per RFC 4180.
 */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
