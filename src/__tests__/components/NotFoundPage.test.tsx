/**
 * Tests for Not Found (404) Page Component
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';

// Mock useTranslate hook
jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'errors.not-found.code': '404',
        'errors.not-found.title': 'Page not found',
        'errors.not-found.description': 'The page you are looking for does not exist or has been moved.',
        'errors.not-found.go-home': 'Back to Dashboard',
      };
      return translations[key] || key;
    },
    locale: 'en',
    setLocale: jest.fn(),
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

describe('Not Found Page', () => {
  it('should render 404 code', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('should render page not found title', () => {
    render(<NotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('should render description', () => {
    render(<NotFound />);
    expect(screen.getByText('The page you are looking for does not exist or has been moved.')).toBeInTheDocument();
  });

  it('should render link to dashboard', () => {
    render(<NotFound />);
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('should have shield icon', () => {
    render(<NotFound />);
    // Check for the icon container with primary color
    const iconContainer = document.querySelector('.bg-guard-primary\\/10');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should have proper layout classes', () => {
    render(<NotFound />);
    const container = document.querySelector('.min-h-screen');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });
});
