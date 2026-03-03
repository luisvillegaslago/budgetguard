/**
 * i18n Configuration
 *
 * Hybrid i18n system optimized for Next.js App Router:
 * - Server Components: Use getDictionary() for direct imports (best for SEO/LCP)
 * - Client Components: Use useTranslate() hook for dynamic language switching
 *
 * Bundle optimization: Uses dynamic imports to load only the active locale
 */

export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export const DEFAULT_LOCALE = 'es';
export type Locale = (typeof SUPPORTED_LOCALES)[number];

type Dictionary = Record<string, unknown>;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import('@/messages/en.json').then((m) => m.default as Dictionary),
  es: () => import('@/messages/es.json').then((m) => m.default as Dictionary),
};

/**
 * Load dictionary for a locale (Server Components)
 * Uses dynamic imports for optimized bundle size
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  const loadDictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  return loadDictionary();
}

/**
 * Validate if a locale string is supported
 */
export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

/**
 * Get nested value from dictionary using dot notation
 */
export function getNestedValue(obj: Dictionary, path: string): string {
  const result = path.split('.').reduce((current, key) => {
    return current && typeof current === 'object' ? (current as Dictionary)[key] : undefined;
  }, obj as unknown);

  return result !== undefined ? String(result) : path;
}

/**
 * Interpolate values into a message string
 */
export function interpolateMessage(message: string, values?: Record<string, string | number | boolean>): string {
  if (!values) return message;

  return message.replace(/\{(\w+)}/g, (match, key) => {
    return values[key] !== undefined ? String(values[key]) : match;
  });
}

/**
 * Create a translation function from a dictionary
 */
export function createTranslator(dictionary: Dictionary) {
  return (key: string, values?: Record<string, string | number | boolean>): string => {
    const message = getNestedValue(dictionary, key);
    return interpolateMessage(message, values);
  };
}
