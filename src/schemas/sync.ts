/**
 * BudgetGuard Backup Schemas
 * Zod validation for backup API endpoints
 */

import { z } from 'zod';

export const SyncExecuteSchema = z.object({
  includeDeletes: z.boolean(),
});

export type SyncExecuteInput = z.infer<typeof SyncExecuteSchema>;
