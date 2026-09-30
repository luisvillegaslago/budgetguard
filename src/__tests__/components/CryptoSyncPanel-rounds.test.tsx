/**
 * Component tests: what the sync panel says about a job longer than one server
 * invocation, and about one that stopped.
 *
 * A job keeps its id across rounds, so the panel keeps polling it; while it is
 * running past its first round, the round is shown as a detail ("tramo 3").
 * A job failed as stuck shows the text for its case: one that never started,
 * or one that stopped reporting progress after fetching part of its data.
 *
 * The translator is the real es.json dictionary, so the assertions read the
 * shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  API_ERROR,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_STATUS,
  type CryptoSyncStatus,
} from '@/constants/finance';
import type { SyncJob } from '@/hooks/useCryptoSync';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockJob: { current: SyncJob | null } = { current: null };

jest.mock('@/hooks/useCryptoSync', () => ({
  useLatestCryptoSyncJob: () => ({ isLoading: false, data: mockJob.current }),
  useCryptoSyncJob: () => ({ data: mockJob.current }),
  useStartCryptoSync: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useCancelCryptoSync: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

jest.mock('@/utils/queryInvalidation', () => ({
  invalidateQueryKeys: jest.fn(),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { CryptoSyncPanel } from '@/components/crypto/CryptoSyncPanel';

function syncJob(status: CryptoSyncStatus, overrides: Partial<SyncJob> = {}): SyncJob {
  return {
    jobId: 31,
    exchange: CRYPTO_EXCHANGE.BINANCE,
    mode: CRYPTO_SYNC_MODE.FULL,
    status,
    scopeFrom: '2017-07-14T00:00:00.000Z',
    scopeTo: '2026-09-29T10:00:00.000Z',
    progress: {} as SyncJob['progress'],
    errorCode: null,
    errorMessage: null,
    eventsIngested: 1590,
    startedAt: '2026-09-29T10:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:04:00.000Z',
    round: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockJob.current = null;
});

describe('CryptoSyncPanel — a job in rounds', () => {
  it('shows the round of a job running past its first one', () => {
    mockJob.current = syncJob(CRYPTO_SYNC_STATUS.RUNNING, { round: 3 });

    render(<CryptoSyncPanel />);

    expect(screen.getByText(`· ${translate('crypto.sync.round', { round: 3 })}`)).toBeInTheDocument();
    expect(translate('crypto.sync.round', { round: 3 })).toBe('tramo 3');
  });

  it.each([
    ['a job in its first round', syncJob(CRYPTO_SYNC_STATUS.RUNNING)],
    ['a finished job', syncJob(CRYPTO_SYNC_STATUS.COMPLETED, { round: 3, finishedAt: '2026-09-29T10:09:00.000Z' })],
  ])('says nothing about rounds for %s', (_case, job) => {
    mockJob.current = job;

    render(<CryptoSyncPanel />);

    expect(screen.queryByText(/tramo/)).not.toBeInTheDocument();
  });
});

describe('CryptoSyncPanel — a job failed as stuck', () => {
  it('a job that stopped reporting progress says so, and that what it fetched is kept', () => {
    mockJob.current = syncJob(CRYPTO_SYNC_STATUS.FAILED, {
      errorCode: API_ERROR.CRYPTO.SYNC_STALLED,
      errorMessage: 'Job stopped reporting progress for 15 minutes.',
      finishedAt: '2026-09-29T10:20:00.000Z',
    });

    render(<CryptoSyncPanel />);

    const text = translate(API_ERROR.CRYPTO.SYNC_STALLED);
    expect(text).toMatch(/dejó de informar de su progreso/);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('a job that never started says that instead', () => {
    mockJob.current = syncJob(CRYPTO_SYNC_STATUS.FAILED, {
      errorCode: API_ERROR.CRYPTO.SYNC_NEVER_STARTED,
      errorMessage: 'Job stayed queued for 5 minutes without starting.',
      finishedAt: '2026-09-29T10:05:00.000Z',
    });

    render(<CryptoSyncPanel />);

    const text = translate(API_ERROR.CRYPTO.SYNC_NEVER_STARTED);
    expect(text).toMatch(/no llegó a empezar/);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
