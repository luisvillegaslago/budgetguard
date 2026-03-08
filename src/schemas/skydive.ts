/**
 * BudgetGuard Skydiving Schemas
 * Zod validation schemas for jumps, tunnel sessions, and CSV imports
 */

import { z } from 'zod';

/**
 * Schema for creating a new jump
 */
export const CreateJumpSchema = z.object({
  jumpNumber: z.number().int().positive('Jump number must be positive'),
  title: z.string().max(255).optional().nullable(),
  jumpDate: z.coerce.date({ message: 'Invalid date' }),
  dropzone: z.string().max(150).optional().nullable(),
  canopy: z.string().max(100).optional().nullable(),
  wingsuit: z.string().max(100).optional().nullable(),
  freefallTimeSec: z.number().int().min(0).optional().nullable(),
  jumpType: z.string().max(100).optional().nullable(),
  aircraft: z.string().max(150).optional().nullable(),
  exitAltitudeFt: z.number().int().min(0).optional().nullable(),
  landingDistanceM: z.number().int().min(0).optional().nullable(),
  comment: z.string().optional().nullable(),
  priceCents: z.number().int().min(0).optional().nullable(),
});

export type CreateJumpInput = z.infer<typeof CreateJumpSchema>;

/**
 * Schema for updating an existing jump
 */
export const UpdateJumpSchema = CreateJumpSchema.partial();

export type UpdateJumpInput = z.infer<typeof UpdateJumpSchema>;

/**
 * Schema for creating a new tunnel session
 */
export const CreateTunnelSessionSchema = z.object({
  sessionDate: z.coerce.date({ message: 'Invalid date' }),
  location: z.string().max(150).optional().nullable(),
  sessionType: z.string().max(100).optional().nullable(),
  durationMin: z.number().positive('Duration must be positive'),
  notes: z.string().optional().nullable(),
  price: z.number().min(0).optional().nullable(),
});

export type CreateTunnelSessionInput = z.infer<typeof CreateTunnelSessionSchema>;

/**
 * Schema for updating an existing tunnel session
 */
export const UpdateTunnelSessionSchema = CreateTunnelSessionSchema.partial();

export type UpdateTunnelSessionInput = z.infer<typeof UpdateTunnelSessionSchema>;

/**
 * Schema for a single row in the jump CSV import
 */
export const ImportJumpRowSchema = z.object({
  jumpNumber: z.number().int().positive(),
  title: z.string().optional().nullable(),
  jumpDate: z.coerce.date(),
  dropzone: z.string().optional().nullable(),
  canopy: z.string().optional().nullable(),
  wingsuit: z.string().optional().nullable(),
  freefallTimeSec: z.number().int().min(0).optional().nullable(),
  jumpType: z.string().optional().nullable(),
  aircraft: z.string().optional().nullable(),
  exitAltitudeFt: z.number().int().min(0).optional().nullable(),
  landingDistanceM: z.number().int().min(0).optional().nullable(),
  comment: z.string().optional().nullable(),
});

export type ImportJumpRow = z.infer<typeof ImportJumpRowSchema>;

/**
 * Schema for a single row in the tunnel CSV import
 */
export const ImportTunnelRowSchema = z.object({
  sessionDate: z.coerce.date(),
  location: z.string().optional().nullable(),
  sessionType: z.string().optional().nullable(),
  durationSec: z.number().int().positive(),
  notes: z.string().optional().nullable(),
  priceCents: z.number().int().min(0).optional().nullable(),
});

export type ImportTunnelRow = z.infer<typeof ImportTunnelRowSchema>;
