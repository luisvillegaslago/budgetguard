/**
 * BudgetGuard Bad Debt (créditos incobrables, art. 80.Cuatro LIVA) API
 * GET /api/fiscal/bad-debt - Issued, uncollected invoices measured against the article: the ones
 *                            whose clock is running and the ones the gate ruled out, with the reason
 *
 * READ-ONLY BY CONSTRUCTION, and there is no POST on purpose. Exercising art. 80.Cuatro means
 * issuing a factura rectificativa, remitting it, uploading the evidence and filing a modelo 952 —
 * none of which this app does. A write verb here would suggest otherwise. The endpoint answers
 * *when* the right may be exercised and *whether* the article reaches the invoice at all.
 *
 * No query parameters either: the report is not scoped to a year or a quarter. A window opens six
 * months or a year after the devengo and closes six months later, so it straddles quarters and
 * years by design, and filtering by the period on screen would hide exactly the invoice whose
 * deadline is about to lapse. The day it is computed against is the server's, never the client's.
 *
 * `outOfScope` travels with the payload rather than being dropped: for this user's portfolio it is
 * every invoice, and an empty module that cannot say why reads as a bug.
 */

import { getBadDebtReport } from '@/services/database/InvoiceRepository';
import { withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const report = await getBadDebtReport();

  return {
    data: report,
    meta: { trackedCount: report.tracked.length, outOfScopeCount: report.outOfScope.length },
  };
}, 'GET /api/fiscal/bad-debt');
