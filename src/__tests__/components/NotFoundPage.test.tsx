/**
 * Tests for Not Found (404) Page Component
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import NotFound from '@/app/not-found';

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: (name: string) => (name === 'locale' ? { value: 'en' } : undefined),
  }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

async function renderAsync(asyncComponent: () => Promise<React.JSX.Element>) {
  const jsx = await asyncComponent();
  return render(jsx);
}

describe('Not Found Page', () => {
  it('should render 404 code', async () => {
    await renderAsync(NotFound);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('should render page not found title', async () => {
    await renderAsync(NotFound);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('should render description', async () => {
    await renderAsync(NotFound);
    expect(screen.getByText('The page you are looking for does not exist or has been moved.')).toBeInTheDocument();
  });

  it('should render link to dashboard', async () => {
    await renderAsync(NotFound);
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('should have shield icon', async () => {
    await renderAsync(NotFound);
    const iconContainer = document.querySelector('.bg-guard-primary\\/10');
    expect(iconContainer).toBeInTheDocument();
  });

  it('should have proper layout classes', async () => {
    await renderAsync(NotFound);
    const container = document.querySelector('.min-h-screen');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });
});
