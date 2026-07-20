/**
 * CSV row parsers for skydiving jump and tunnel session imports.
 * Extracted from the skydiving page for testability.
 */

/**
 * Parse a D/M/YY or DD/MM/YYYY slash-separated date into ISO YYYY-MM-DD.
 * Two-digit years > 50 are treated as 19xx, otherwise 20xx.
 * Returns null if the string is not a valid 3-part slash date.
 */
function parseSlashDate(dateStr: string): string | null {
  const dateParts = dateStr.split('/');
  if (dateParts.length !== 3) return null;

  const day = (dateParts[0] ?? '').padStart(2, '0');
  const month = (dateParts[1] ?? '').padStart(2, '0');
  let year = dateParts[2] ?? '';
  if (year.length === 2) {
    year = Number(year) > 50 ? `19${year}` : `20${year}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Parse a jump date, accepting ISO YYYY-MM-DD (Cloudbase) or slash formats.
 */
function parseJumpDate(dateStr: string): string | null {
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateStr;
  return parseSlashDate(dateStr);
}

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

  const jumpNumber = Number(
    normalized['jump number'] ?? normalized.jumpnumber ?? normalized['jump #'] ?? normalized['#'] ?? '',
  );
  if (!jumpNumber || Number.isNaN(jumpNumber)) return null;

  // Parse date: ISO YYYY-MM-DD (Cloudbase) or D/M/YY / DD/MM/YYYY (slash formats)
  const dateStr = normalized.date ?? normalized.jumpdate ?? '';
  const jumpDate = parseJumpDate(dateStr);
  if (!jumpDate) return null;

  // Parse freefall time in seconds
  const ffRaw = normalized['freefall time'] ?? normalized.freefalltime ?? normalized['freefall (s)'] ?? '';
  let freefallTimeSec: number | null = null;
  if (ffRaw) {
    const ffNum = Number(ffRaw);
    freefallTimeSec = Number.isNaN(ffNum) ? null : ffNum;
  }

  const altRaw = normalized['exit altitude'] ?? normalized.exitaltitude ?? normalized['exit alt (ft)'] ?? '';
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
    dropzone: normalized.dropzone || normalized.dz || normalized['drop zone'] || null,
    canopy: normalized.canopy || null,
    wingsuit: normalized.wingsuit || null,
    freefallTimeSec,
    jumpType: normalized['jump type'] || normalized.type || normalized.jumptype || normalized.discipline || null,
    aircraft: normalized.aircraft || normalized.plane || null,
    exitAltitudeFt,
    landingDistanceM,
    comment: normalized.comment || normalized.notes || null,
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
  const sessionDate = parseSlashDate(dateStr);
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
