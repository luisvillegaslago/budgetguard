/**
 * Tests for Session Provider
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { SessionProvider } from '@/providers/SessionProvider';

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}));

describe('SessionProvider', () => {
  it('should render children', () => {
    render(
      <SessionProvider>
        <div data-testid="child">Child Component</div>
      </SessionProvider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child Component')).toBeInTheDocument();
  });

  it('should wrap children with NextAuth SessionProvider', () => {
    render(
      <SessionProvider>
        <div>Test</div>
      </SessionProvider>,
    );

    expect(screen.getByTestId('session-provider')).toBeInTheDocument();
  });

  it('should accept optional session prop', () => {
    const mockSession = {
      user: { userId: 1, name: 'Test User', email: 'test@example.com' },
      expires: '2025-01-01',
    };

    render(
      <SessionProvider session={mockSession}>
        <div>With Session</div>
      </SessionProvider>,
    );

    expect(screen.getByText('With Session')).toBeInTheDocument();
  });

  it('should work without session prop', () => {
    render(
      <SessionProvider>
        <div>Without Session</div>
      </SessionProvider>,
    );

    expect(screen.getByText('Without Session')).toBeInTheDocument();
  });
});
