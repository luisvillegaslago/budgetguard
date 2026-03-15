/**
 * Error i18n key integrity test
 * Validates that ALL keys in API_ERROR and VALIDATION_KEY exist in both en.json and es.json.
 * Prevents orphaned keys that would show raw i18n paths to the user.
 */

import { API_ERROR, VALIDATION_KEY } from '@/constants/finance';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

function collectLeafValues(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap((v) =>
    typeof v === 'string' ? [v] : collectLeafValues(v as Record<string, unknown>),
  );
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce(
      (curr, key) => (curr && typeof curr === 'object' ? (curr as Record<string, unknown>)[key] : undefined),
      obj as unknown,
    );
}

describe('Error i18n key integrity', () => {
  const apiErrorKeys = collectLeafValues(API_ERROR as unknown as Record<string, unknown>);
  const validationKeys = collectLeafValues(VALIDATION_KEY as unknown as Record<string, unknown>);
  const allKeys = [...apiErrorKeys, ...validationKeys];

  describe('API_ERROR keys', () => {
    apiErrorKeys.forEach((key) => {
      it(`"${key}" exists in en.json`, () => {
        expect(getNestedValue(en as unknown as Record<string, unknown>, key)).toBeDefined();
      });
      it(`"${key}" exists in es.json`, () => {
        expect(getNestedValue(es as unknown as Record<string, unknown>, key)).toBeDefined();
      });
    });
  });

  describe('VALIDATION_KEY keys', () => {
    validationKeys.forEach((key) => {
      it(`"${key}" exists in en.json`, () => {
        expect(getNestedValue(en as unknown as Record<string, unknown>, key)).toBeDefined();
      });
      it(`"${key}" exists in es.json`, () => {
        expect(getNestedValue(es as unknown as Record<string, unknown>, key)).toBeDefined();
      });
    });
  });

  it('has no duplicate keys', () => {
    const unique = new Set(allKeys);
    expect(unique.size).toBe(allKeys.length);
  });
});
