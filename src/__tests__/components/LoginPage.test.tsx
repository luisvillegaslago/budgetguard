/**
 * Component Tests: Login Page
 * Tests that the login page renders correctly with i18n
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

// Mock next/navigation — useSearchParams returns a URLSearchParams instance
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth/react — use inline fn to avoid hoisting issues
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

// Mock version hook
jest.mock('@/hooks/useAppVersion', () => ({
  useAppVersion: () => '0.3.0',
}));

// Mock i18n hook
jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'common.app-name': 'BudgetGuard',
        'auth.login-subtitle': 'Controla tus gastos familiares',
        'auth.sign-in-google': 'Iniciar sesión con Google',
      };
      return translations[key] ?? key;
    },
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { signIn } from 'next-auth/react';
import LoginPage from '@/app/login/page';

describe('LoginPage', () => {
  beforeEach(() => {
    (signIn as jest.Mock).mockReset();
  });

  it('should render app name', () => {
    render(<LoginPage />);
    expect(screen.getByText('BudgetGuard')).toBeInTheDocument();
  });

  it('should render login subtitle', () => {
    render(<LoginPage />);
    expect(screen.getByText('Controla tus gastos familiares')).toBeInTheDocument();
  });

  it('should render Google sign-in button', () => {
    render(<LoginPage />);
    const button = screen.getByText('Iniciar sesión con Google');
    expect(button).toBeInTheDocument();
  });

  it('should call signIn with google provider on button click', () => {
    render(<LoginPage />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard' });
  });

  it('should render Shield icon', () => {
    render(<LoginPage />);
    const svg = document.querySelector('svg.lucide-shield');
    expect(svg).toBeInTheDocument();
  });

  it('should use dark theme background', () => {
    render(<LoginPage />);
    const container = document.querySelector('.bg-guard-dark');
    expect(container).toBeInTheDocument();
  });
});
