/**
 * Tests for Static Translations Helper
 * Used for error boundaries that render outside of React providers
 */

import Cookies from 'js-cookie';
import { detectLocale, getErrorTranslations, getStaticTranslation } from '@/utils/staticTranslations';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
  };
})();

// Mock navigator
const mockNavigator = {
  language: 'es-ES',
};

describe('staticTranslations', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    Cookies.remove('NEXT_LOCALE');
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });
    Object.defineProperty(window, 'navigator', { value: mockNavigator, writable: true });
  });

  describe('detectLocale', () => {
    it('should return "es" as default locale', () => {
      expect(detectLocale()).toBe('es');
    });

    it('should detect locale from localStorage', () => {
      mockLocalStorage.setItem('budgetguard-locale', 'en');
      expect(detectLocale()).toBe('en');
    });

    it('should detect locale from cookie', () => {
      Cookies.set('NEXT_LOCALE', 'en');
      expect(detectLocale()).toBe('en');
    });

    it('should detect locale from browser language', () => {
      Object.defineProperty(window, 'navigator', {
        value: { language: 'en-US' },
        writable: true,
      });
      expect(detectLocale()).toBe('en');
    });

    it('should prioritize localStorage over cookies', () => {
      mockLocalStorage.setItem('budgetguard-locale', 'es');
      Cookies.set('NEXT_LOCALE', 'en');
      expect(detectLocale()).toBe('es');
    });
  });

  describe('getStaticTranslation', () => {
    it('should return Spanish translation for errors.global.title', () => {
      const result = getStaticTranslation('errors.global.title', 'es');
      expect(result).toBe('Error Crítico');
    });

    it('should return English translation for errors.global.title', () => {
      const result = getStaticTranslation('errors.global.title', 'en');
      expect(result).toBe('Critical Error');
    });

    it('should return path as fallback for non-existent key', () => {
      const result = getStaticTranslation('non.existent.key', 'es');
      expect(result).toBe('non.existent.key');
    });

    it('should return app name correctly', () => {
      const result = getStaticTranslation('common.app-name', 'es');
      expect(result).toBe('BudgetGuard');
    });
  });

  describe('getErrorTranslations', () => {
    it('should return Spanish error translations', () => {
      const result = getErrorTranslations('es');
      expect(result.appName).toBe('BudgetGuard');
      expect(result.global.title).toBe('Error Crítico');
      expect(result.global.reload).toBe('Recargar Página');
    });

    it('should return English error translations', () => {
      const result = getErrorTranslations('en');
      expect(result.appName).toBe('BudgetGuard');
      expect(result.global.title).toBe('Critical Error');
      expect(result.global.reload).toBe('Reload Page');
    });

    it('should detect locale automatically when not provided', () => {
      mockLocalStorage.setItem('budgetguard-locale', 'en');
      const result = getErrorTranslations();
      expect(result.global.title).toBe('Critical Error');
    });
  });
});
