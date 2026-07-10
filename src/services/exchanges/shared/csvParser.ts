/**
 * Generic CSV parser shared by every exchange importer.
 *
 * No dependencies. Handles quoted fields with embedded commas, escaped quotes
 * (`""`), CRLF line endings and a leading UTF-8 BOM (Binance, Kraken and
 * Coinbase all prepend one to their exports). Returns a matrix of string cells,
 * header row included.
 */
export function parseCsv(content: string): string[][] {
  // Strip the UTF-8 BOM that exchanges prepend to their CSV exports.
  const sanitized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuotes = false;

  for (let i = 0; i < sanitized.length; i++) {
    const ch = sanitized[i];
    if (insideQuotes) {
      if (ch === '"') {
        // Escaped quote inside a quoted field
        if (sanitized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      insideQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}
