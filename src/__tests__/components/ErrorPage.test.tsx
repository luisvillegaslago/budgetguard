/**
 * Tests for Error Page Component
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js Error component naming convention
import Error from '@/app/error';

// Mock useTranslate hook
jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'errors.page.title': 'Something went wrong',
        'errors.page.description': 'An unexpected error occurred. Please try again.',
        'errors.page.retry': 'Try again',
      };
      return translations[key] || key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

describe('Error Page', () => {
  const mockReset = jest.fn();
  const mockError = { message: 'Test error', name: 'Error' } as Error & { digest?: string };

  beforeEach(() => {
    mockReset.mockClear();
  });

  it('should render error title', () => {
    render(<Error error={mockError} reset={mockReset} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('should render error description', () => {
    render(<Error error={mockError} reset={mockReset} />);
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
  });

  it('should render retry button', () => {
    render(<Error error={mockError} reset={mockReset} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('should call reset when retry button is clicked', () => {
    render(<Error error={mockError} reset={mockReset} />);
    const button = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(button);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('should render alert icon', () => {
    render(<Error error={mockError} reset={mockReset} />);
    // Check for the icon container
    const iconContainer = document.querySelector('.bg-guard-danger\\/10');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should have proper styling classes', () => {
    render(<Error error={mockError} reset={mockReset} />);
    const container = document.querySelector('.min-h-screen');
    expect(container).toHaveClass('bg-guard-light');
  });
});
