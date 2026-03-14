/**
 * Bulk import fiscal documents from local directory structure.
 * Reads year/quarter/type from folder path, uploads to Vercel Blob, inserts into DB.
 *
 * Usage: npx tsx scripts/import-fiscal-docs.ts
 *
 * Expected directory structure:
 *   {year}/{Ntrimestre}/gastos/*.pdf      → factura_recibida, quarter N
 *   {year}/{Ntrimestre}/ingresos/*.pdf    → factura_recibida, quarter N
 *   {year}/{Ntrimestre}/*.pdf             → modelo (auto-detect from filename)
 *   {year}/anuales/*.pdf                  → modelo annual or factura_recibida
 *   {year}/gastos/*.pdf                   → factura_recibida (no quarter)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { put } from '@vercel/blob';
import pg from 'pg';

// ============================================================
// Configuration
// ============================================================

const BASE_DIR = String.raw`C:\Users\luisv\Dropbox\personal\documentación\fiscal\Declaraciones y Facturas`;
const YEARS = [2023, 2024, 2025, 2026];
const USER_ID = 1;
const DRY_RUN = process.argv.includes('--dry-run');

// Use local DB via pg (not neon serverless)
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:poipoi@localhost:5432/budgetguard';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ============================================================
// Types
// ============================================================

interface FileMetadata {
  filePath: string;
  fileName: string;
  fiscalYear: number;
  fiscalQuarter: number | null;
  documentType: 'modelo' | 'factura_recibida' | 'factura_emitida';
  modeloType: '303' | '130' | '390' | '100' | null;
  status: 'filed' | 'pending';
  description: string | null;
}

// ============================================================
// Path parsing
// ============================================================

const QUARTER_MAP: Record<string, number> = {
  '1trimestre': 1,
  '2trimestre': 2,
  '3trimestre': 3,
  '4trimestre': 4,
};

const MODELO_PATTERNS: Array<{ pattern: RegExp; type: '303' | '130' | '390' | '100' }> = [
  { pattern: /\b303\b/i, type: '303' },
  { pattern: /\b130\b/i, type: '130' },
  { pattern: /\b390\b/i, type: '390' },
  { pattern: /\b100\b/i, type: '100' },
];

function detectModeloType(fileName: string): '303' | '130' | '390' | '100' | null {
  const match = MODELO_PATTERNS.find((p) => p.pattern.test(fileName));
  return match?.type ?? null;
}

function parseFilePath(filePath: string, year: number): FileMetadata | null {
  const rel = relative(join(BASE_DIR, String(year)), filePath).replace(/\\/g, '/');
  const parts = rel.split('/');
  const fileName = basename(filePath);

  // Skip non-PDF files
  if (!fileName.toLowerCase().endsWith('.pdf')) return null;

  let fiscalQuarter: number | null = null;
  let isGastos = false;
  let isIngresos = false;
  let isAnuales = false;

  parts.forEach((part) => {
    const lower = part.toLowerCase();
    if (QUARTER_MAP[lower] != null) fiscalQuarter = QUARTER_MAP[lower]!;
    if (lower === 'gastos') isGastos = true;
    if (lower === 'ingresos') isIngresos = true;
    if (lower === 'anuales') isAnuales = true;
  });

  // Files in gastos/ → factura_recibida; ingresos/ → factura_emitida
  // If no quarter detected from folder structure, default to Q1 (e.g. 2026/gastos/)
  if (isGastos || isIngresos) {
    return {
      filePath,
      fileName,
      fiscalYear: year,
      fiscalQuarter: fiscalQuarter ?? 1,
      documentType: isIngresos ? 'factura_emitida' : 'factura_recibida',
      modeloType: null,
      status: 'filed',
      description: fileName.replace(/\.pdf$/i, ''),
    };
  }

  // Files directly in a trimestre folder or anuales — try to detect modelo
  const modeloType = detectModeloType(fileName);

  if (modeloType) {
    const isAnnual = modeloType === '390' || modeloType === '100';
    return {
      filePath,
      fileName,
      fiscalYear: year,
      fiscalQuarter: isAnnual ? null : fiscalQuarter,
      documentType: 'modelo',
      modeloType,
      status: 'filed',
      description: null,
    };
  }

  // Anuales folder but not a modelo — treat as factura
  if (isAnuales) {
    return {
      filePath,
      fileName,
      fiscalYear: year,
      fiscalQuarter: null,
      documentType: 'factura_recibida',
      modeloType: null,
      status: 'filed',
      description: fileName.replace(/\.pdf$/i, ''),
    };
  }

  // Fallback: factura recibida
  return {
    filePath,
    fileName,
    fiscalYear: year,
    fiscalQuarter,
    documentType: 'factura_recibida',
    modeloType: null,
    status: 'filed',
    description: fileName.replace(/\.pdf$/i, ''),
  };
}

// ============================================================
// File discovery
// ============================================================

function findFiles(dir: string): string[] {
  const results: string[] = [];

  readdirSync(dir).forEach((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (entry.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  });

  return results;
}

// ============================================================
// Upload & Insert
// ============================================================

async function alreadyExists(meta: FileMetadata): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM "FiscalDocuments" WHERE "FileName" = $1 AND "FiscalYear" = $2 AND "UserID" = $3 LIMIT 1',
    [meta.fileName, meta.fiscalYear, USER_ID],
  );
  return result.rows.length > 0;
}

async function uploadAndInsert(meta: FileMetadata): Promise<void> {
  const fileBuffer = readFileSync(meta.filePath);
  const fileSize = statSync(meta.filePath).size;

  // Upload to Vercel Blob
  const pathname = `fiscal/${USER_ID}/${meta.fiscalYear}/${meta.fileName}`;
  const blob = await put(pathname, fileBuffer, {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/pdf',
  });

  // Insert into DB
  await pool.query(
    `INSERT INTO "FiscalDocuments" (
      "UserID", "DocumentType", "ModeloType", "FiscalYear", "FiscalQuarter",
      "Status", "BlobUrl", "BlobPathname", "FileName", "FileSizeBytes",
      "ContentType", "Description"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      USER_ID, meta.documentType, meta.modeloType, meta.fiscalYear, meta.fiscalQuarter,
      meta.status, blob.url, blob.pathname, meta.fileName, fileSize,
      'application/pdf', meta.description,
    ],
  );
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n📂 Scanning ${BASE_DIR} for years: ${YEARS.join(', ')}`);
  if (DRY_RUN) console.log('🔍 DRY RUN — no uploads or inserts\n');

  let totalFiles = 0;
  let uploaded = 0;
  let errors = 0;

  const allFiles: FileMetadata[] = [];

  YEARS.forEach((year) => {
    const yearDir = join(BASE_DIR, String(year));
    try {
      const files = findFiles(yearDir);
      files.forEach((filePath) => {
        const meta = parseFilePath(filePath, year);
        if (meta) allFiles.push(meta);
      });
    } catch {
      console.log(`⚠️  Directory not found: ${yearDir}`);
    }
  });

  totalFiles = allFiles.length;
  console.log(`Found ${totalFiles} PDF files\n`);

  // Summary table
  console.log('Type          | Count');
  console.log('------------- | -----');
  const modelos = allFiles.filter((f) => f.documentType === 'modelo');
  const facturas = allFiles.filter((f) => f.documentType === 'factura_recibida');
  console.log(`Modelos       | ${modelos.length}`);
  console.log(`Facturas rec. | ${facturas.length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('Files to import:');
    allFiles.forEach((f) => {
      const q = f.fiscalQuarter ? `Q${f.fiscalQuarter}` : 'annual';
      const tipo = f.documentType === 'modelo' ? `M${f.modeloType}` : 'factura';
      console.log(`  ${f.fiscalYear} ${q.padEnd(7)} ${tipo.padEnd(10)} ${f.fileName}`);
    });
    return;
  }

  // Upload sequentially to avoid rate limits
  for (let i = 0; i < allFiles.length; i++) {
    const meta = allFiles[i]!;
    const progress = `[${i + 1}/${totalFiles}]`;
    try {
      if (await alreadyExists(meta)) {
        console.log(`⏭️  ${progress} ${meta.fileName} (already exists)`);
        continue;
      }
      await uploadAndInsert(meta);
      uploaded++;
      console.log(`✅ ${progress} ${meta.fileName}`);
    } catch (err) {
      errors++;
      console.log(`❌ ${progress} ${meta.fileName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✅ Done: ${uploaded} uploaded, ${errors} errors out of ${totalFiles} files`);
  await pool.end();
}

main().catch(console.error);
