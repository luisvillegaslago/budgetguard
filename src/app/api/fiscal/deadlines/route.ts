/**
 * GET /api/fiscal/deadlines — Server-computed AEAT deadlines for a year
 * All deadline logic runs on the server. The frontend only consumes pre-computed data.
 */

import { AnnualFiscalFiltersSchema } from '@/schemas/fiscal';
import { validateRequest } from '@/schemas/transaction';
import { getDeadlineSettings, getFiledModelos } from '@/services/database/FiscalDocumentRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';
import { computeDeadlines, getActiveDeadlines } from '@/utils/fiscalDeadlines';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const onlyActive = searchParams.get('active') === 'true';

  // Default to current year if not provided
  const yearParam = searchParams.get('year') || String(new Date().getFullYear());
  const validation = validateRequest(AnnualFiscalFiltersSchema, { year: yearParam });
  if (!validation.success) return validationError(validation.errors);

  const { year } = validation.data;

  // Fetch settings and filed modelos in parallel
  const [settings, filedSet] = await Promise.all([getDeadlineSettings(), getFiledModelos(year)]);

  const deadlines = computeDeadlines(year, filedSet, settings.reminderDaysBefore);

  return {
    data: onlyActive ? getActiveDeadlines(deadlines) : deadlines,
    meta: { year, reminderDaysBefore: settings.reminderDaysBefore },
  };
}, 'GET /api/fiscal/deadlines');
