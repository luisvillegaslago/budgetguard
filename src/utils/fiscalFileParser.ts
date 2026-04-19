/**
 * Fiscal File Name Parser (server-side only)
 * Parses document file names to auto-detect metadata for bulk upload.
 */

import type { FiscalDocumentType, FiscalStatus, ModeloType } from '@/constants/finance';
import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';

export interface ParsedFileMetadata {
  documentType: FiscalDocumentType;
  modeloType: ModeloType | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  status: FiscalStatus;
  description: string | null;
}

// Pattern: "303 1T 2024.pdf" or "modelo 303 Q1 2024.pdf"
const MODELO_PATTERN = /(?:modelo\s*)?(\d{3})\s*(?:([1-4])[tTqQ]|[tTqQ]([1-4]))\s*(\d{4})/i;

// Pattern: "390 2024.pdf" or "100 2024.pdf" (annual models)
const ANNUAL_MODELO_PATTERN = /(?:modelo\s*)?(\d{3})\s+(\d{4})/i;

// Pattern for quarter: "1T", "Q1", "T1", etc.
const QUARTER_PATTERN = /([1-4])[tTqQ]|[tTqQ]([1-4])/;

// Pattern for year: 4-digit year between 2019-2099
const YEAR_PATTERN = /\b(20[12]\d)\b/;

const VALID_MODELO_TYPES = new Set([MODELO_TYPE.M303, MODELO_TYPE.M130, MODELO_TYPE.M390, MODELO_TYPE.M100]);

/**
 * Parse a document filename to auto-detect fiscal metadata.
 * Examples:
 * - "303 1T 2024.pdf" → { modelo, 303, 2024, Q1, filed }
 * - "vodafone enero 2024.pdf" → { factura_recibida, null, 2024, null, pending }
 * - "aplazamiento 303 1T 2024.pdf" → { modelo, 303, 2024, Q1, filed }
 */
export function parseDocumentFilename(filename: string): ParsedFileMetadata {
  // Remove extension for parsing
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  // Try quarterly modelo pattern first
  const quarterlyMatch = nameWithoutExt.match(MODELO_PATTERN);
  if (quarterlyMatch) {
    const modeloNum = quarterlyMatch[1] ?? '';
    const quarter = Number.parseInt(quarterlyMatch[2] ?? quarterlyMatch[3] ?? '0', 10);
    const year = Number.parseInt(quarterlyMatch[4] ?? '0', 10);
    const modeloType = VALID_MODELO_TYPES.has(modeloNum as ModeloType) ? (modeloNum as ModeloType) : null;

    if (modeloType) {
      return {
        documentType: FISCAL_DOCUMENT_TYPE.MODELO,
        modeloType,
        fiscalYear: year,
        fiscalQuarter: modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100 ? null : quarter,
        status: FISCAL_STATUS.FILED,
        description: null,
      };
    }
  }

  // Try annual modelo pattern
  const annualMatch = nameWithoutExt.match(ANNUAL_MODELO_PATTERN);
  if (annualMatch) {
    const modeloNum = annualMatch[1] ?? '';
    const year = Number.parseInt(annualMatch[2] ?? '0', 10);
    const modeloType = VALID_MODELO_TYPES.has(modeloNum as ModeloType) ? (modeloNum as ModeloType) : null;

    if (modeloType) {
      return {
        documentType: FISCAL_DOCUMENT_TYPE.MODELO,
        modeloType,
        fiscalYear: year,
        fiscalQuarter: modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100 ? null : null,
        status: FISCAL_STATUS.FILED,
        description: null,
      };
    }
  }

  // Not a modelo — treat as factura recibida
  const yearMatch = nameWithoutExt.match(YEAR_PATTERN);
  const quarterMatch = nameWithoutExt.match(QUARTER_PATTERN);

  return {
    documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
    modeloType: null,
    fiscalYear: yearMatch ? Number.parseInt(yearMatch[1] ?? '0', 10) : null,
    fiscalQuarter: quarterMatch ? Number.parseInt(quarterMatch[1] ?? quarterMatch[2] ?? '0', 10) : null,
    status: FISCAL_STATUS.PENDING,
    description: nameWithoutExt,
  };
}

/**
 * Build a normalized filename for modelo documents following Spanish convention.
 * Quarterly (303, 130): "130 1T 2026.pdf"
 * Annual (390, 100): "390 2026.pdf"
 * Returns the original filename unchanged if required metadata is missing.
 */
export function buildModeloFileName(
  modeloType: ModeloType | null,
  fiscalQuarter: number | null,
  fiscalYear: number | null,
  originalFilename: string,
): string {
  if (!modeloType || !fiscalYear) return originalFilename;

  const extMatch = originalFilename.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';

  const isAnnual = modeloType === MODELO_TYPE.M390 || modeloType === MODELO_TYPE.M100;
  if (isAnnual) return `${modeloType} ${fiscalYear}${ext}`;

  if (!fiscalQuarter) return originalFilename;
  return `${modeloType} ${fiscalQuarter}T ${fiscalYear}${ext}`;
}
