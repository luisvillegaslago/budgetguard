/**
 * Component Tests: FiscalDeadlineBanner — the due date is a formatted date, not the raw column
 *
 * `FiscalDeadline.endDate` arrives as the ISO `YYYY-MM-DD` string that computeDeadlines() emits
 * (src/utils/fiscalDeadlines.ts). The banner used to interpolate it straight into the copy, so the
 * dashboard read «vence 2026-10-20» while the fiscal page's panel showed the very same field as
 * `20/10/2026`. It goes through formatDate(..., 'numeric', locale), which formats with
 * `timeZone: 'UTC'` so a PostgreSQL DATE (UTC midnight) is not shifted a day back.
 *
 * The translator is the real es.json dictionary, so a renamed key breaks these tests.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { FILING_STATUS, MODELO_TYPE } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { FiscalDeadline } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUseUpcomingDeadlines = jest.fn();

jest.mock('@/hooks/useFiscalDeadlines', () => ({
  useUpcomingDeadlines: () => mockUseUpcomingDeadlines(),
}));

jest.mock('@/stores/useFinanceStore', () => ({
  useIsFiscalPanelCollapsed: () => false,
  useToggleFiscalPanel: () => jest.fn(),
  useIsAlertDismissed: () => false,
  useDismissAlert: () => jest.fn(),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

import { FiscalDeadlineBanner } from '@/components/fiscal/FiscalDeadlineBanner';

/** Modelo 303 Q3 2026: window 1-20 October 2026, due while the banner is showing it */
const M303_Q3: FiscalDeadline = {
  modeloType: MODELO_TYPE.M303,
  fiscalYear: 2026,
  fiscalQuarter: 3,
  startDate: '2026-10-01',
  endDate: '2026-10-20',
  nominalEndDate: '2026-10-20',
  domiciliacionEndDate: '2026-10-15',
  isWindowConfirmed: true,
  status: FILING_STATUS.DUE,
  isFiled: false,
  daysRemaining: 5,
  needsPostponement: false,
};

describe('FiscalDeadlineBanner — due date formatting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prints the deadline as DD/MM/YYYY, never as the raw YYYY-MM-DD string', () => {
    mockUseUpcomingDeadlines.mockReturnValue({ data: [M303_Q3] });

    render(<FiscalDeadlineBanner />);

    expect(screen.getByText('vence 20/10/2026')).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-20/)).not.toBeInTheDocument();
  });

  it('does not shift the date a day back (UTC midnight DATE)', () => {
    // 1 January is the day a local-timezone format would turn into 31 December of the year before
    mockUseUpcomingDeadlines.mockReturnValue({
      data: [{ ...M303_Q3, fiscalQuarter: 4, startDate: '2027-01-01', endDate: '2027-01-01' }],
    });

    render(<FiscalDeadlineBanner />);

    expect(screen.getByText('vence 01/01/2027')).toBeInTheDocument();
  });
});
