/**
 * Unit Tests: Skydive Zod Schemas
 * Tests validation for CreateJumpSchema, UpdateJumpSchema,
 * CreateTunnelSessionSchema, UpdateTunnelSessionSchema,
 * ImportJumpRowSchema, and ImportTunnelRowSchema
 */

import {
  CreateJumpSchema,
  CreateTunnelSessionSchema,
  ImportJumpRowSchema,
  ImportTunnelRowSchema,
  UpdateJumpSchema,
  UpdateTunnelSessionSchema,
} from '@/schemas/skydive';

// ============================
// CreateJumpSchema
// ============================
describe('CreateJumpSchema', () => {
  const validJump = {
    jumpNumber: 150,
    jumpDate: '2026-03-01',
  };

  const fullJump = {
    ...validJump,
    title: 'Sunset jump over the coast',
    dropzone: 'Skydive Empuriabrava',
    canopy: 'Sabre3 170',
    wingsuit: 'Squirrel Aura 3',
    freefallTimeSec: 60,
    jumpType: 'Belly',
    aircraft: 'Pilatus Porter',
    exitAltitudeFt: 15000,
    landingDistanceM: 5,
    comment: 'Great visibility',
    priceCents: 3500,
  };

  it('should accept valid jump with only required fields', () => {
    const result = CreateJumpSchema.safeParse(validJump);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumpNumber).toBe(150);
      expect(result.data.jumpDate).toBeInstanceOf(Date);
    }
  });

  it('should accept valid jump with all fields', () => {
    const result = CreateJumpSchema.safeParse(fullJump);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumpNumber).toBe(150);
      expect(result.data.title).toBe('Sunset jump over the coast');
      expect(result.data.dropzone).toBe('Skydive Empuriabrava');
      expect(result.data.canopy).toBe('Sabre3 170');
      expect(result.data.wingsuit).toBe('Squirrel Aura 3');
      expect(result.data.freefallTimeSec).toBe(60);
      expect(result.data.jumpType).toBe('Belly');
      expect(result.data.aircraft).toBe('Pilatus Porter');
      expect(result.data.exitAltitudeFt).toBe(15000);
      expect(result.data.landingDistanceM).toBe(5);
      expect(result.data.comment).toBe('Great visibility');
      expect(result.data.priceCents).toBe(3500);
    }
  });

  // Required field rejections
  it('should reject missing jumpNumber', () => {
    const { jumpNumber, ...withoutJumpNumber } = validJump;
    const result = CreateJumpSchema.safeParse(withoutJumpNumber);
    expect(result.success).toBe(false);
  });

  it('should reject missing jumpDate', () => {
    const { jumpDate, ...withoutDate } = validJump;
    const result = CreateJumpSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  // jumpNumber validation
  it('should reject zero jumpNumber', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative jumpNumber', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpNumber: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer jumpNumber', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpNumber: 1.5 });
    expect(result.success).toBe(false);
  });

  it('should reject string jumpNumber', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpNumber: 'abc' });
    expect(result.success).toBe(false);
  });

  it('should accept jumpNumber of 1', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpNumber: 1 });
    expect(result.success).toBe(true);
  });

  // jumpDate validation
  it('should coerce valid date string', () => {
    const result = CreateJumpSchema.safeParse(validJump);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumpDate).toBeInstanceOf(Date);
    }
  });

  it('should reject invalid date string', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  // String field max length boundaries
  it('should reject title longer than 255 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, title: 'A'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('should accept title with exactly 255 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, title: 'A'.repeat(255) });
    expect(result.success).toBe(true);
  });

  it('should reject dropzone longer than 150 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, dropzone: 'D'.repeat(151) });
    expect(result.success).toBe(false);
  });

  it('should accept dropzone with exactly 150 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, dropzone: 'D'.repeat(150) });
    expect(result.success).toBe(true);
  });

  it('should reject canopy longer than 100 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, canopy: 'C'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept canopy with exactly 100 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, canopy: 'C'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('should reject wingsuit longer than 100 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, wingsuit: 'W'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should reject jumpType longer than 100 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, jumpType: 'J'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should reject aircraft longer than 150 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, aircraft: 'A'.repeat(151) });
    expect(result.success).toBe(false);
  });

  it('should accept aircraft with exactly 150 characters', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, aircraft: 'A'.repeat(150) });
    expect(result.success).toBe(true);
  });

  // Numeric field min 0 boundaries
  it('should reject negative freefallTimeSec', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, freefallTimeSec: -1 });
    expect(result.success).toBe(false);
  });

  it('should accept freefallTimeSec of 0', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, freefallTimeSec: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative exitAltitudeFt', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, exitAltitudeFt: -100 });
    expect(result.success).toBe(false);
  });

  it('should accept exitAltitudeFt of 0', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, exitAltitudeFt: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative landingDistanceM', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, landingDistanceM: -5 });
    expect(result.success).toBe(false);
  });

  it('should accept landingDistanceM of 0', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, landingDistanceM: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative priceCents', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, priceCents: -100 });
    expect(result.success).toBe(false);
  });

  it('should accept priceCents of 0', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, priceCents: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject non-integer freefallTimeSec', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, freefallTimeSec: 30.5 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer exitAltitudeFt', () => {
    const result = CreateJumpSchema.safeParse({ ...validJump, exitAltitudeFt: 14999.9 });
    expect(result.success).toBe(false);
  });

  // Optional/nullable field defaults
  it('should accept null for optional fields', () => {
    const result = CreateJumpSchema.safeParse({
      ...validJump,
      title: null,
      dropzone: null,
      canopy: null,
      wingsuit: null,
      freefallTimeSec: null,
      jumpType: null,
      aircraft: null,
      exitAltitudeFt: null,
      landingDistanceM: null,
      comment: null,
      priceCents: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept undefined for optional fields', () => {
    const result = CreateJumpSchema.safeParse({
      ...validJump,
      title: undefined,
      dropzone: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// ============================
// UpdateJumpSchema
// ============================
describe('UpdateJumpSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = UpdateJumpSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only jumpNumber', () => {
    const result = UpdateJumpSchema.safeParse({ jumpNumber: 200 });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only jumpDate', () => {
    const result = UpdateJumpSchema.safeParse({ jumpDate: '2026-05-10' });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only title', () => {
    const result = UpdateJumpSchema.safeParse({ title: 'Updated title' });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only comment', () => {
    const result = UpdateJumpSchema.safeParse({ comment: 'New comment' });
    expect(result.success).toBe(true);
  });

  it('should still reject negative jumpNumber when provided', () => {
    const result = UpdateJumpSchema.safeParse({ jumpNumber: -1 });
    expect(result.success).toBe(false);
  });

  it('should still reject zero jumpNumber when provided', () => {
    const result = UpdateJumpSchema.safeParse({ jumpNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('should still reject title exceeding max length when provided', () => {
    const result = UpdateJumpSchema.safeParse({ title: 'T'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('should still reject negative priceCents when provided', () => {
    const result = UpdateJumpSchema.safeParse({ priceCents: -50 });
    expect(result.success).toBe(false);
  });

  it('should still reject invalid jumpDate when provided', () => {
    const result = UpdateJumpSchema.safeParse({ jumpDate: 'invalid' });
    expect(result.success).toBe(false);
  });
});

// ============================
// CreateTunnelSessionSchema
// ============================
describe('CreateTunnelSessionSchema', () => {
  const validSession = {
    sessionDate: '2026-02-15',
    durationMin: 120,
  };

  const fullSession = {
    ...validSession,
    location: 'iFly Madrid',
    sessionType: 'Belly',
    notes: 'Focus on turns',
  };

  it('should accept valid session with only required fields', () => {
    const result = CreateTunnelSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDate).toBeInstanceOf(Date);
      expect(result.data.durationMin).toBe(120);
    }
  });

  it('should accept valid session with all fields', () => {
    const result = CreateTunnelSessionSchema.safeParse(fullSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe('iFly Madrid');
      expect(result.data.sessionType).toBe('Belly');
      expect(result.data.notes).toBe('Focus on turns');
    }
  });

  // Required field rejections
  it('should reject missing sessionDate', () => {
    const { sessionDate, ...withoutDate } = validSession;
    const result = CreateTunnelSessionSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it('should reject missing durationMin', () => {
    const { durationMin, ...withoutDuration } = validSession;
    const result = CreateTunnelSessionSchema.safeParse(withoutDuration);
    expect(result.success).toBe(false);
  });

  // durationMin validation
  it('should reject zero durationMin', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, durationMin: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative durationMin', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, durationMin: -10 });
    expect(result.success).toBe(false);
  });

  it('should accept decimal durationMin (e.g., 0.5 = 30 seconds)', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, durationMin: 0.5 });
    expect(result.success).toBe(true);
  });

  it('should accept durationMin of 1', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, durationMin: 1 });
    expect(result.success).toBe(true);
  });

  // sessionDate validation
  it('should reject invalid sessionDate', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, sessionDate: 'bad-date' });
    expect(result.success).toBe(false);
  });

  it('should coerce valid date string', () => {
    const result = CreateTunnelSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDate).toBeInstanceOf(Date);
    }
  });

  // String field max length boundaries
  it('should reject location longer than 150 characters', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, location: 'L'.repeat(151) });
    expect(result.success).toBe(false);
  });

  it('should accept location with exactly 150 characters', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, location: 'L'.repeat(150) });
    expect(result.success).toBe(true);
  });

  it('should reject sessionType longer than 100 characters', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, sessionType: 'S'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should accept sessionType with exactly 100 characters', () => {
    const result = CreateTunnelSessionSchema.safeParse({ ...validSession, sessionType: 'S'.repeat(100) });
    expect(result.success).toBe(true);
  });

  // Optional/nullable fields
  it('should accept null for optional fields', () => {
    const result = CreateTunnelSessionSchema.safeParse({
      ...validSession,
      location: null,
      sessionType: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept undefined for optional fields', () => {
    const result = CreateTunnelSessionSchema.safeParse({
      ...validSession,
      location: undefined,
      sessionType: undefined,
      notes: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// ============================
// UpdateTunnelSessionSchema
// ============================
describe('UpdateTunnelSessionSchema', () => {
  it('should accept empty object (all fields optional)', () => {
    const result = UpdateTunnelSessionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only durationMin', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ durationMin: 180 });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only sessionDate', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ sessionDate: '2026-04-01' });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with only location', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ location: 'iFly Barcelona' });
    expect(result.success).toBe(true);
  });

  it('should still reject zero durationMin when provided', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ durationMin: 0 });
    expect(result.success).toBe(false);
  });

  it('should still reject negative durationMin when provided', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ durationMin: -5 });
    expect(result.success).toBe(false);
  });

  it('should still reject location exceeding max length when provided', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ location: 'X'.repeat(151) });
    expect(result.success).toBe(false);
  });

  it('should still reject invalid sessionDate when provided', () => {
    const result = UpdateTunnelSessionSchema.safeParse({ sessionDate: 'nope' });
    expect(result.success).toBe(false);
  });
});

// ============================
// ImportJumpRowSchema
// ============================
describe('ImportJumpRowSchema', () => {
  const validRow = {
    jumpNumber: 42,
    jumpDate: '2026-01-20',
  };

  it('should accept valid import row with only required fields', () => {
    const result = ImportJumpRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumpNumber).toBe(42);
      expect(result.data.jumpDate).toBeInstanceOf(Date);
    }
  });

  it('should accept valid import row with all optional fields', () => {
    const result = ImportJumpRowSchema.safeParse({
      ...validRow,
      title: 'First solo',
      dropzone: 'Skydive Spain',
      canopy: 'Navigator 260',
      wingsuit: null,
      freefallTimeSec: 45,
      jumpType: 'Static Line',
      aircraft: 'Cessna 182',
      exitAltitudeFt: 4000,
      landingDistanceM: 10,
      comment: 'Smooth landing',
    });
    expect(result.success).toBe(true);
  });

  // Required field rejections
  it('should reject missing jumpNumber', () => {
    const { jumpNumber, ...withoutNumber } = validRow;
    const result = ImportJumpRowSchema.safeParse(withoutNumber);
    expect(result.success).toBe(false);
  });

  it('should reject missing jumpDate', () => {
    const { jumpDate, ...withoutDate } = validRow;
    const result = ImportJumpRowSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  // jumpNumber validation
  it('should reject zero jumpNumber', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, jumpNumber: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative jumpNumber', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, jumpNumber: -3 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer jumpNumber', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, jumpNumber: 2.7 });
    expect(result.success).toBe(false);
  });

  // Numeric min 0 fields
  it('should reject negative freefallTimeSec', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, freefallTimeSec: -1 });
    expect(result.success).toBe(false);
  });

  it('should accept freefallTimeSec of 0', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, freefallTimeSec: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative exitAltitudeFt', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, exitAltitudeFt: -500 });
    expect(result.success).toBe(false);
  });

  it('should accept exitAltitudeFt of 0', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, exitAltitudeFt: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject negative landingDistanceM', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, landingDistanceM: -2 });
    expect(result.success).toBe(false);
  });

  // Nullable optional fields
  it('should accept null for all optional fields', () => {
    const result = ImportJumpRowSchema.safeParse({
      ...validRow,
      title: null,
      dropzone: null,
      canopy: null,
      wingsuit: null,
      freefallTimeSec: null,
      jumpType: null,
      aircraft: null,
      exitAltitudeFt: null,
      landingDistanceM: null,
      comment: null,
    });
    expect(result.success).toBe(true);
  });

  // Invalid date
  it('should reject invalid jumpDate', () => {
    const result = ImportJumpRowSchema.safeParse({ ...validRow, jumpDate: 'not-valid' });
    expect(result.success).toBe(false);
  });
});

// ============================
// ImportTunnelRowSchema
// ============================
describe('ImportTunnelRowSchema', () => {
  const validRow = {
    sessionDate: '2026-02-10',
    durationSec: 60,
  };

  it('should accept valid import row with only required fields', () => {
    const result = ImportTunnelRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDate).toBeInstanceOf(Date);
      expect(result.data.durationSec).toBe(60);
    }
  });

  it('should accept valid import row with all optional fields', () => {
    const result = ImportTunnelRowSchema.safeParse({
      ...validRow,
      location: 'iFly London',
      sessionType: 'Head-down',
      notes: 'Need more practice',
      priceCents: 5000,
    });
    expect(result.success).toBe(true);
  });

  // Required field rejections
  it('should reject missing sessionDate', () => {
    const { sessionDate, ...withoutDate } = validRow;
    const result = ImportTunnelRowSchema.safeParse(withoutDate);
    expect(result.success).toBe(false);
  });

  it('should reject missing durationSec', () => {
    const { durationSec, ...withoutDuration } = validRow;
    const result = ImportTunnelRowSchema.safeParse(withoutDuration);
    expect(result.success).toBe(false);
  });

  // durationSec validation
  it('should reject zero durationSec', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, durationSec: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative durationSec', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, durationSec: -10 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer durationSec', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, durationSec: 30.5 });
    expect(result.success).toBe(false);
  });

  it('should accept durationSec of 1', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, durationSec: 1 });
    expect(result.success).toBe(true);
  });

  // priceCents validation
  it('should reject negative priceCents', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, priceCents: -100 });
    expect(result.success).toBe(false);
  });

  it('should accept priceCents of 0', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, priceCents: 0 });
    expect(result.success).toBe(true);
  });

  it('should reject non-integer priceCents', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, priceCents: 19.99 });
    expect(result.success).toBe(false);
  });

  // sessionDate validation
  it('should reject invalid sessionDate', () => {
    const result = ImportTunnelRowSchema.safeParse({ ...validRow, sessionDate: 'garbage' });
    expect(result.success).toBe(false);
  });

  // Nullable optional fields
  it('should accept null for all optional fields', () => {
    const result = ImportTunnelRowSchema.safeParse({
      ...validRow,
      location: null,
      sessionType: null,
      notes: null,
      priceCents: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept undefined for optional fields', () => {
    const result = ImportTunnelRowSchema.safeParse({
      ...validRow,
      location: undefined,
      sessionType: undefined,
      notes: undefined,
      priceCents: undefined,
    });
    expect(result.success).toBe(true);
  });
});
