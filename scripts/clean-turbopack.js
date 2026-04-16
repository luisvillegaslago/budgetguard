/**
 * Clean Turbopack dev cache when it exceeds a size threshold.
 *
 * Usage:
 *   node scripts/clean-turbopack.js          # clean if > 500MB
 *   node scripts/clean-turbopack.js --force   # always clean
 */

const fs = require('node:fs');
const path = require('node:path');

const NEXT_DIR = path.join(__dirname, '..', '.next');
const DEV_DIR = path.join(NEXT_DIR, 'dev');
const THRESHOLD_MB = 500;

function getDirSizeMB(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSizeMB(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  });
  return total / (1024 * 1024);
}

const force = process.argv.includes('--force');
const sizeMB = getDirSizeMB(DEV_DIR);

if (force || sizeMB > THRESHOLD_MB) {
  const reason = force ? 'forced' : `${Math.round(sizeMB)}MB > ${THRESHOLD_MB}MB threshold`;
  console.log(`🧹 Cleaning .next/ (${reason})...`);
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log('✓ Done');
} else if (sizeMB > 0) {
  console.log(`✓ Turbopack cache OK (${Math.round(sizeMB)}MB)`);
}
