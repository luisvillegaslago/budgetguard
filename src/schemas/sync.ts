/**
 * BudgetGuard Backup Schemas
 * Zod validation for backup API endpoints
 */

import { z } from 'zod';

// .strict() so a caller sending an unknown field gets a 400 instead of having it
// dropped in silence. API_REFERENCE.md once documented a `direction` field that
// never existed in this schema; a non-strict object accepted it and backed up in
// the only direction it supports, so the mismatch stayed invisible.
export const SyncExecuteSchema = z
  .object({
    includeDeletes: z.boolean(),
  })
  .strict();

export type SyncExecuteInput = z.infer<typeof SyncExecuteSchema>;
