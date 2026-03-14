/**
 * GET /api/fiscal/deadlines/settings — Get deadline reminder preferences
 * PUT /api/fiscal/deadlines/settings — Update deadline reminder preferences (UPSERT)
 */

import { FiscalDeadlineSettingsSchema } from '@/schemas/fiscal-document';
import { validateRequest } from '@/schemas/transaction';
import { getDeadlineSettings, upsertDeadlineSettings } from '@/services/database/FiscalDocumentRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async () => {
  const settings = await getDeadlineSettings();
  return { data: settings };
}, 'GET /api/fiscal/deadlines/settings');

export const PUT = withApiHandler(async (request) => {
  const body = await request.json();
  const validation = validateRequest(FiscalDeadlineSettingsSchema, body);
  if (!validation.success) return validationError(validation.errors);

  const settings = await upsertDeadlineSettings({
    reminderDaysBefore: validation.data.reminderDaysBefore ?? 7,
    postponementReminder: validation.data.postponementReminder ?? true,
    isActive: validation.data.isActive ?? true,
  });
  return { data: settings };
}, 'PUT /api/fiscal/deadlines/settings');
