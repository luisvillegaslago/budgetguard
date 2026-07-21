/**
 * BudgetGuard Skydiving Types
 * Types for skydive jumps, tunnel sessions, and aggregated statistics
 */

import type { RECONCILE_ACTION, SKYDIVE_ACTIVITY_TYPE } from '@/constants/finance';

/**
 * Kind of skydiving activity a voucher consumption maps to.
 * Derived from constants to stay DRY: 'jump' | 'tunnel'.
 */
export type SkydiveActivityType = (typeof SKYDIVE_ACTIVITY_TYPE)[keyof typeof SKYDIVE_ACTIVITY_TYPE];

/**
 * Outcome of reconciling a voucher consumption: 'linked' | 'created' | 'already_linked'.
 */
export type ReconcileAction = (typeof RECONCILE_ACTION)[keyof typeof RECONCILE_ACTION];

/**
 * Result of reconciling a voucher consumption transaction to a skydiving activity.
 * `id` is the JumpID or SessionID of the linked/created activity.
 */
export interface ReconcileConsumptionResult {
  activityType: SkydiveActivityType;
  action: ReconcileAction;
  id: number;
}

/**
 * Skydive jump record
 */
export interface SkydiveJump {
  jumpId: number;
  jumpNumber: number;
  title: string | null;
  jumpDate: string;
  dropzone: string | null;
  canopy: string | null;
  wingsuit: string | null;
  freefallTimeSec: number | null;
  jumpType: string | null;
  aircraft: string | null;
  exitAltitudeFt: number | null;
  landingDistanceM: number | null;
  comment: string | null;
  priceCents: number | null;
  transactionId: number | null;
  // Voucher ("bono") this jump was paid from, read from the linked transaction
  voucherId: number | null;
  voucherUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tunnel session record
 */
export interface TunnelSession {
  sessionId: number;
  sessionDate: string;
  location: string | null;
  sessionType: string | null;
  durationSec: number;
  notes: string | null;
  priceCents: number | null;
  transactionId: number | null;
  // Voucher ("bono") this session was paid from, read from the linked transaction
  voucherId: number | null;
  voucherUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Jumps grouped by type (from vw_JumpsByType)
 */
export interface JumpsByType {
  jumpType: string;
  count: number;
  totalFreefallSec: number;
}

/**
 * Jumps grouped by year (from vw_JumpsByYear)
 */
export interface JumpsByYear {
  year: number;
  count: number;
  totalFreefallSec: number;
}

/**
 * Aggregated skydiving statistics (from vw_SkydivingStats + breakdown views)
 */
export interface SkydiveStats {
  totalJumps: number;
  totalFreefallSec: number;
  uniqueDropzones: number;
  lastJumpDate: string | null;
  totalTunnelSec: number;
  totalTunnelSessions: number;
  totalCostCents: number;
  jumpsByType: JumpsByType[];
  jumpsByYear: JumpsByYear[];
}

/**
 * Import result for bulk CSV operations
 */
export interface ImportResult {
  inserted: number;
  skipped: number;
  updated?: number;
  total: number;
}
