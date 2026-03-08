/**
 * CSV row parsers for skydiving jump and tunnel session imports.
 * Extracted from the skydiving page for testability.
 */

/**
 * Parse a raw CSV row into a skydive jump record.
 * Returns null if the row is invalid (missing jump number or date).
 */
export function parseJumpRow(raw: Record<string, string>): Record<string, unknown> | null {
  // Normalize keys to handle case variations (e.g., "Jump number" vs "Jump Number")
  const normalized: Record<string, string> = {};
  Object.entries(raw).forEach(([key, value]) => {
    normalized[key.toLowerCase()] = value;
  });

  const jumpNumber = Number(normalized['jump number'] ?? normalized.jumpnumber ?? normalized['#'] ?? '');
  if (!jumpNumber || Number.isNaN(jumpNumber)) return null;

  // Parse date: D/M/YY or DD/MM/YYYY
  const dateStr = normalized.date ?? normalized.jumpdate ?? '';
  const dateParts = dateStr.split('/');
  let jumpDate: string | null = null;
  if (dateParts.length === 3) {
    const day = (dateParts[0] ?? '').padStart(2, '0');
    const month = (dateParts[1] ?? '').padStart(2, '0');
    let year = dateParts[2] ?? '';
    if (year.length === 2) {
      year = Number(year) > 50 ? `19${year}` : `20${year}`;
    }
    jumpDate = `${year}-${month}-${day}`;
  }
  if (!jumpDate) return null;

  // Parse freefall time in seconds
  const ffRaw = normalized['freefall time'] ?? normalized.freefalltime ?? '';
  let freefallTimeSec: number | null = null;
  if (ffRaw) {
    const ffNum = Number(ffRaw);
    freefallTimeSec = Number.isNaN(ffNum) ? null : ffNum;
  }

  const altRaw = normalized['exit altitude'] ?? normalized.exitaltitude ?? '';
  let exitAltitudeFt: number | null = null;
  if (altRaw) {
    const altClean = altRaw.replace(/[^\d]/g, '');
    const altNum = Number(altClean);
    exitAltitudeFt = Number.isNaN(altNum) ? null : altNum;
  }

  const landingRaw = normalized['landing distance from the target'] ?? normalized.landingdistancem ?? '';
  let landingDistanceM: number | null = null;
  if (landingRaw) {
    const landNum = Number(landingRaw);
    landingDistanceM = Number.isNaN(landNum) ? null : landNum;
  }

  return {
    jumpNumber,
    title: normalized.title || null,
    jumpDate,
    dropzone: normalized.dropzone ?? normalized.dz ?? null,
    canopy: normalized.canopy || null,
    wingsuit: normalized.wingsuit || null,
    freefallTimeSec,
    jumpType: normalized['jump type'] ?? normalized.type ?? normalized.jumptype ?? null,
    aircraft: normalized.aircraft ?? normalized.plane ?? null,
    exitAltitudeFt,
    landingDistanceM,
    comment: normalized.comment ?? normalized.notes ?? null,
  };
}

/**
 * Parse a raw CSV row into a tunnel session record.
 * Returns null if the row is invalid (missing date or duration).
 */
export function parseTunnelRow(raw: Record<string, string>): Record<string, unknown> | null {
  // Normalize keys to handle case variations
  const n: Record<string, string> = {};
  Object.entries(raw).forEach(([key, value]) => {
    n[key.toLowerCase()] = value;
  });

  // Parse date: DD/MM/YYYY
  const dateStr = n.fecha ?? n.date ?? n.sessiondate ?? '';
  const dateParts = dateStr.split('/');
  let sessionDate: string | null = null;
  if (dateParts.length === 3) {
    const day = (dateParts[0] ?? '').padStart(2, '0');
    const month = (dateParts[1] ?? '').padStart(2, '0');
    let year = dateParts[2] ?? '';
    if (year.length === 2) {
      year = Number(year) > 50 ? `19${year}` : `20${year}`;
    }
    sessionDate = `${year}-${month}-${day}`;
  }
  if (!sessionDate) return null;

  // Parse duration: "H:MM" → hours:minutes to seconds, or plain number → minutes
  const durRaw = n.tiempo ?? n.duration ?? n.durationsec ?? '';
  let durationSec = 0;
  if (durRaw.includes(':')) {
    const parts = durRaw.split(':');
    durationSec = (Number(parts[0]) * 60 + Number(parts[1])) * 60;
  } else {
    durationSec = Number(durRaw) * 60;
  }
  if (!durationSec || Number.isNaN(durationSec)) return null;

  // Parse price: "12,50" or "12.50" → cents
  const priceRaw = n.precio ?? n.price ?? n.pricecents ?? '';
  let priceCents: number | null = null;
  if (priceRaw) {
    const priceNormalized = priceRaw.replace(',', '.');
    const priceNum = Number.parseFloat(priceNormalized);
    if (!Number.isNaN(priceNum)) {
      priceCents = Math.round(priceNum * 100);
    }
  }

  return {
    sessionDate,
    location: n.lugar ?? n.location ?? null,
    sessionType: n.tipo ?? n.type ?? n.sessiontype ?? null,
    durationSec,
    priceCents,
    notes: n.notes ?? n.notas ?? null,
  };
}
