/**
 * BudgetGuard Sync Schemas
 * Zod validation for sync API endpoints
 */

import { z } from 'zod';
import { SYNC_DIRECTION } from '@/constants/finance';

export const SyncExecuteSchema = z.object({
  direction: z.enum([SYNC_DIRECTION.PUSH, SYNC_DIRECTION.PULL]),
  includeDeletes: z.boolean(),
});

export type SyncExecuteInput = z.infer<typeof SyncExecuteSchema>;
