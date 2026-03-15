/**
 * Build a normalized display name for fiscal documents post-OCR.
 * Format: "Vendor - YYYY-MM-DD.ext" (language-agnostic)
 */

interface BuildDisplayNameParams {
  vendor: string | null;
  companyName?: string | null;
  date: string | null;
  originalFileName: string;
}

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(lastDot) : '';
}

export function buildDisplayName({
  vendor,
  companyName,
  date,
  originalFileName,
}: BuildDisplayNameParams): string | null {
  const ext = getExtension(originalFileName);
  const name = companyName ?? vendor;

  if (name && date) return `${name} - ${date}${ext}`;
  if (name) return `${name}${ext}`;
  if (date) return `${date}${ext}`;
  return null;
}
