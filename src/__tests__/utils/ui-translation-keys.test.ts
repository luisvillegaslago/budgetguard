/**
 * UI translation key integrity test
 *
 * Statically scans the fiscal UI for literal `t('some.key')` calls and resolves every key
 * against BOTH dictionaries. It catches the classic regression of adding a key to es.json
 * only: the English user then sees the raw dot path instead of a translated string, and
 * nothing else in the build complains.
 *
 * SCOPE — the whole of src/, excluding the tests themselves.
 *
 * LIMITATION — only literal keys are checked. Keys assembled at runtime (template
 * literals, variables, `t(errors.field.message ?? '')`) are invisible to a static scan,
 * so a green run does not prove every translation in the module resolves.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** Roots scanned for translation calls, relative to the repo root. */
const SCANNED_DIRS = ['src'];

/** The tests are not UI: their fixtures legitimately mention keys that do not exist. */
const EXCLUDED_DIRS = ['__tests__'];

/**
 * Matches `t('key')` and `t("key")` only. The lookbehind rejects member calls such as
 * `.t(` and any identifier ending in `t`, so helpers are never mistaken for the
 * translator. useTranslate() is never destructured under an alias, so no real call escapes.
 */
const TRANSLATE_CALL = /(?<![\w$.])t\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g;

const SOURCE_FILE = /\.tsx?$/;

const DICTIONARIES = [
  { name: 'es.json', messages: es as unknown as Record<string, unknown> },
  { name: 'en.json', messages: en as unknown as Record<string, unknown> },
];

interface KeyUsage {
  file: string;
  key: string;
}

interface Violation extends KeyUsage {
  missingFrom: string[];
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRS.includes(entry.name) ? [] : listSourceFiles(fullPath);
    return SOURCE_FILE.test(entry.name) && !entry.name.includes('.test.') ? [fullPath] : [];
  });
}

function collectKeyUsages(dir: string): KeyUsage[] {
  return listSourceFiles(dir).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return (
      Array.from(source.matchAll(TRANSLATE_CALL))
        .map((match) => match[2] ?? '')
        // t('') is the react-hook-form error fallback, not a key
        .filter((key) => key.length > 0)
        .map((key) => ({ file, key }))
    );
  });
}

/**
 * A key only resolves when its dot path lands on a string leaf. Pointing at an object
 * node renders "[object Object]", so it counts as missing too.
 */
function resolvesToString(messages: Record<string, unknown>, key: string): boolean {
  const leaf = key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined,
      messages,
    );
  return typeof leaf === 'string';
}

function formatViolations(violations: Violation[]): string {
  const byFile = new Map<string, string[]>();

  violations.forEach(({ file, key, missingFrom }) => {
    const relativePath = relative(REPO_ROOT, file).split(sep).join('/');
    const lines = byFile.get(relativePath) ?? [];
    lines.push(`  ${key} — missing from ${missingFrom.join(' and ')}`);
    byFile.set(relativePath, lines);
  });

  return Array.from(byFile.entries())
    .map(([file, lines]) => [file, ...lines].join('\n'))
    .join('\n\n');
}

describe('UI translation key integrity', () => {
  const usages = SCANNED_DIRS.flatMap((dir) => collectKeyUsages(join(REPO_ROOT, dir)));

  it('finds the literal translation keys of the whole UI', () => {
    // Guards the scanner itself: a broken regex would make the assertion below vacuously green
    expect(usages.length).toBeGreaterThan(500);
  });

  it('resolves every literal key in both es.json and en.json', () => {
    const violations = usages.flatMap<Violation>(({ file, key }) => {
      const missingFrom = DICTIONARIES.filter(({ messages }) => !resolvesToString(messages, key)).map(
        ({ name }) => name,
      );
      return missingFrom.length > 0 ? [{ file, key, missingFrom }] : [];
    });

    expect(formatViolations(violations)).toBe('');
  });

  it('counts a key pointing at an object node as unresolved', () => {
    const messages = es as unknown as Record<string, unknown>;

    expect(resolvesToString(messages, 'fiscal.irpf-projection')).toBe(false);
    expect(resolvesToString(messages, 'fiscal.irpf-projection.title')).toBe(true);
  });
});
