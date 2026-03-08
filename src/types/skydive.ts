/**
 * BudgetGuard Skydiving Types
 * Types for skydive jumps, tunnel sessions, and aggregated statistics
 */

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
