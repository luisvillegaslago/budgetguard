/**
 * Tests for Global Error Component
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import GlobalError from '@/app/global-error';

// Mock staticTranslations
jest.mock('@/utils/staticTranslations', () => ({
  detectLocale: () => 'en',
  getErrorTranslations: () => ({
    appName: 'BudgetGuard',
    global: {
      title: 'Critical Error',
      description: 'An unexpected error occurred in the application. Please reload the page to continue.',
      reload: 'Reload Page',
      'support-hint': 'If the problem persists, contact support.',
    },
  }),
}));

// Suppress expected React warning about <html> being child of <div>
// GlobalError renders a full HTML document (Next.js global error boundary pattern)
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (message.includes('<html> cannot be a child of <div>')) {
      return;
    }
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('Global Error Page', () => {
  const mockReset = jest.fn();
  const mockError = { message: 'Test error', name: 'Error' } as Error & { digest?: string };

  beforeEach(() => {
    mockReset.mockClear();
  });

  it('should render app name', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(screen.getByText('BudgetGuard')).toBeInTheDocument();
  });

  it('should render error title', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(screen.getByText('Critical Error')).toBeInTheDocument();
  });

  it('should render error description', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('should render reload button', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('should call reset when reload button is clicked', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    const button = screen.getByRole('button', { name: /reload page/i });
    fireEvent.click(button);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('should render support hint', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(screen.getByText(/If the problem persists/)).toBeInTheDocument();
  });

  it('should have proper page title', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    expect(document.title).toBe('Critical Error - BudgetGuard');
  });

  it('should render with inline styles (no CSS dependencies)', () => {
    render(<GlobalError error={mockError} reset={mockReset} />);
    const body = document.querySelector('body');
    // Global error uses inline styles
    expect(body).toHaveStyle({ margin: '0' });
  });
});
