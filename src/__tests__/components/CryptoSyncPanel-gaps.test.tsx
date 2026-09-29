/**
 * Component tests: a sync job that completed although some tasks failed in a
 * way every run would repeat (a spot history too long to walk, an endpoint
 * Binance refuses to the key) shows those gaps as a warning, not as a failure,
 * and names the pairs and endpoints so the user knows what to import by CSV.
 * A pair whose walk stored part of its fills and continues on the next
 * incremental sync is listed apart, without asking for a CSV.
 *
 * The translator is the real es.json dictionary, so the assertions read the
 * shipped Spanish copy and a renamed key breaks the test.
 */

import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import {
  API_ERROR,
  CRYPTO_EVENT_TYPE,
  CRYPTO_EXCHANGE,
  CRYPTO_SYNC_COMPLETED_WITH_GAPS,
  CRYPTO_SYNC_MODE,
  CRYPTO_SYNC_STATUS,
  CRYPTO_SYNC_TASK_FAILURE,
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

const WINDOW = { fetched: 0, totalWindows: 1, completedWindows: 1, lastWindowEnd: null };

function syncJob(overrides: Partial<SyncJob>): SyncJob {
  return {
    jobId: 42,
    exchange: CRYPTO_EXCHANGE.BINANCE,
    mode: CRYPTO_SYNC_MODE.INCREMENTAL,
    status: CRYPTO_SYNC_STATUS.COMPLETED,
    scopeFrom: '2026-09-21T00:00:00.000Z',
    scopeTo: '2026-09-28T00:00:00.000Z',
    progress: {} as SyncJob['progress'],
    errorCode: null,
    errorMessage: null,
    eventsIngested: 3,
    startedAt: '2026-09-28T05:00:00.000Z',
    finishedAt: '2026-09-28T05:10:00.000Z',
    createdAt: '2026-09-28T05:00:00.000Z',
    updatedAt: '2026-09-28T05:10:00.000Z',
    ...overrides,
  };
}

// Progress holds one entry per event type; only the three below matter here.
const EMPTY_PROGRESS = Object.fromEntries(
  Object.values(CRYPTO_EVENT_TYPE).map((type) => [type, WINDOW]),
) as SyncJob['progress'];

const PROGRESS_WITH_GAPS: SyncJob['progress'] = {
  ...EMPTY_PROGRESS,
  [CRYPTO_EVENT_TYPE.SPOT_TRADE]: {
    ...WINDOW,
    fetched: 3,
    permanentFailures: [{ code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_TRUNCATED, count: 2, symbols: ['BTCUSDT', 'ETHBTC'] }],
  },
  [CRYPTO_EVENT_TYPE.DEPOSIT]: {
    ...WINDOW,
    permanentFailures: [{ code: CRYPTO_SYNC_TASK_FAILURE.ENDPOINT_NOT_PERMITTED, count: 1, symbols: [] }],
  },
  [CRYPTO_EVENT_TYPE.CONVERT]: { ...WINDOW, fetched: 4 },
};

function gapsWarning(): HTMLElement {
  return screen.getByRole('region', { name: translate('crypto.sync.gaps.title') });
}

beforeEach(() => {
  mockJob.current = null;
});

describe('CryptoSyncPanel — gaps a new sync would not fill', () => {
  it('a job completed with gaps lists them as a warning, not as a failure', () => {
    mockJob.current = syncJob({
      progress: PROGRESS_WITH_GAPS,
      errorCode: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      errorMessage: '  spot_trade/history_truncated ×2: BTCUSDT, ETHBTC',
    });

    render(<CryptoSyncPanel />);

    expect(screen.getByText(translate('crypto.sync.status.completed-with-gaps'))).toBeInTheDocument();
    const items = within(gapsWarning()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(CRYPTO_EVENT_TYPE.SPOT_TRADE);
    expect(items[0]).toHaveTextContent('BTCUSDT, ETHBTC');
    expect(items[0]).toHaveTextContent(translate('crypto.sync.gaps.history-truncated'));
    expect(items[1]).toHaveTextContent(CRYPTO_EVENT_TYPE.DEPOSIT);
    expect(items[1]).toHaveTextContent(translate('crypto.sync.gaps.endpoint-not-permitted'));
    // The stored code is a flag for the gaps, not an error to show.
    expect(screen.queryByText(CRYPTO_SYNC_COMPLETED_WITH_GAPS)).not.toBeInTheDocument();
  });

  it('a failed job keeps its failure message and also names the gaps a retry will not fill', () => {
    mockJob.current = syncJob({
      status: CRYPTO_SYNC_STATUS.FAILED,
      progress: PROGRESS_WITH_GAPS,
      errorCode: API_ERROR.CRYPTO.SYNC_FAILED,
      errorMessage: '  deposit/api-error.crypto.exchange-unavailable (binance -1000) ×1',
    });

    render(<CryptoSyncPanel />);

    expect(screen.getByText(translate(API_ERROR.CRYPTO.SYNC_FAILED))).toBeInTheDocument();
    expect(within(gapsWarning()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('a job whose only gap is a pair the next sync continues says so, and does not ask for a CSV', () => {
    mockJob.current = syncJob({
      progress: {
        ...EMPTY_PROGRESS,
        [CRYPTO_EVENT_TYPE.SPOT_TRADE]: {
          ...WINDOW,
          fetched: 100_000,
          resumableFailures: [
            { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
          ],
        },
      },
      errorCode: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      errorMessage: '  spot_trade/history_resumes_next_run ×1: BTCUSDT',
    });

    render(<CryptoSyncPanel />);

    expect(screen.getByText(translate('crypto.sync.status.completed-with-gaps'))).toBeInTheDocument();
    const notice = screen.getByRole('region', { name: translate('crypto.sync.gaps.resumable-title') });
    const [item] = within(notice).getAllByRole('listitem');
    expect(item).toHaveTextContent('BTCUSDT');
    expect(item).toHaveTextContent(translate('crypto.sync.gaps.history-resumes-next-run'));
    expect(screen.queryByRole('region', { name: translate('crypto.sync.gaps.title') })).not.toBeInTheDocument();
    expect(screen.queryByText(translate('crypto.sync.gaps.history-truncated'), { exact: false })).toBeNull();
  });

  it('a job with both kinds of gap lists each under its own heading and shows the details once', () => {
    mockJob.current = syncJob({
      progress: {
        ...PROGRESS_WITH_GAPS,
        [CRYPTO_EVENT_TYPE.SPOT_TRADE]: {
          ...WINDOW,
          resumableFailures: [
            { code: CRYPTO_SYNC_TASK_FAILURE.HISTORY_RESUMES_NEXT_RUN, count: 1, symbols: ['BTCUSDT'] },
          ],
        },
      },
      errorCode: CRYPTO_SYNC_COMPLETED_WITH_GAPS,
      errorMessage: '  spot_trade/history_resumes_next_run ×1: BTCUSDT\n  deposit/endpoint_not_permitted ×1',
    });

    render(<CryptoSyncPanel />);

    expect(within(gapsWarning()).getAllByRole('listitem')).toHaveLength(1);
    const notice = screen.getByRole('region', { name: translate('crypto.sync.gaps.resumable-title') });
    expect(within(notice).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getAllByText(translate('crypto.sync.error-details'))).toHaveLength(1);
  });

  it('a job completed without gaps shows no warning', () => {
    mockJob.current = syncJob({ progress: { [CRYPTO_EVENT_TYPE.CONVERT]: WINDOW } as SyncJob['progress'] });

    render(<CryptoSyncPanel />);

    expect(screen.getByText(translate('crypto.sync.status.completed'))).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: translate('crypto.sync.gaps.title') })).not.toBeInTheDocument();
  });
});
