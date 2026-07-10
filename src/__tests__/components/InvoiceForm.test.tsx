/**
 * Component Tests: InvoiceForm
 *
 * The form opens in hourly mode, so the hours and hourlyRate inputs mount empty. Switching
 * to a flat amount hides them but react-hook-form keeps their registered value, and
 * valueAsNumber turned '' into NaN — which every branch of the line-item schema rejects.
 * Neither field renders an error, so "Crear" did nothing at all: no request, no message.
 *
 * These tests pin the submitted payload, including the VAT and IRPF rates.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IRPF_RETENTION_RATE, VAT_RATE } from '@/constants/finance';

interface CreateInvoicePayload {
  lineItems: { amountCents: number; hours: number | null }[];
  vatPercent: number;
  retentionPercent: number;
}

// Typed input, so the assertions below can read mock.calls[0][0] without casting it back.
const mockCreateInvoice = jest.fn(async (_input: CreateInvoicePayload) => ({ invoiceId: 42 }));

jest.mock('@/hooks/useInvoices', () => ({
  useInvoicePrefixes: () => ({ data: [{ prefixId: 7, prefix: 'DW', nextNumber: 9, isActive: true }] }),
  useBillingProfile: () => ({ data: { defaultHourlyRateCents: null } }),
  useCreateInvoice: () => ({ mutateAsync: mockCreateInvoice, isPending: false, errorMessage: null }),
  useUpdateInvoice: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useCreateInvoicePrefix: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@/components/ui/ModalBackdrop', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The real one fetches companies; here it only needs to feed a companyId into the form.
jest.mock('@/components/ui/CompanySelector', () => ({
  CompanySelector: ({ onChange }: { onChange: (id: number | null) => void }) => (
    <button type="button" data-testid="pick-client" onClick={() => onChange(3)}>
      pick client
    </button>
  ),
}));

jest.mock('@/components/invoices/InlinePrefixForm', () => ({
  InlinePrefixForm: () => null,
}));

import { InvoiceForm } from '@/components/invoices/InvoiceForm';

/** Fills prefix + client, which every submit needs. The prefix select is controlled. */
async function fillHeader() {
  // Client first: picking one can auto-select its series, which would clobber the prefix.
  fireEvent.click(screen.getByTestId('pick-client'));
  await userEvent.selectOptions(screen.getByLabelText('invoices.form.fields.prefix'), '7');
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'common.buttons.create' }));
}

describe('InvoiceForm', () => {
  beforeEach(() => {
    mockCreateInvoice.mockClear();
  });

  it('creates an invoice billed by concept after switching away from hourly mode', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    await fillHeader();
    // Hours and hourlyRate mounted empty here; switching to flat leaves them registered.
    fireEvent.click(screen.getByRole('button', { name: 'invoices.form.billing-mode.flat' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });

    submit();

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledTimes(1));

    const payload = mockCreateInvoice.mock.calls[0]?.[0];
    expect(payload?.lineItems[0]?.amountCents).toBe(100000);
    expect(payload?.lineItems[0]?.hours).toBeNull();
  });

  it('submits the selected VAT and IRPF rates as numbers', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    await fillHeader();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.form.billing-mode.flat' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('invoices.vatRate'), { target: { value: String(VAT_RATE.STANDARD) } });
    fireEvent.change(screen.getByLabelText('invoices.retentionRate'), {
      target: { value: String(IRPF_RETENTION_RATE.GENERAL) },
    });

    submit();

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledTimes(1));

    const payload = mockCreateInvoice.mock.calls[0]?.[0];
    expect(payload?.vatPercent).toBe(21);
    expect(payload?.retentionPercent).toBe(15);
  });

  it('previews the breakdown the server will persist', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'invoices.form.billing-mode.flat' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('invoices.vatRate'), { target: { value: String(VAT_RATE.STANDARD) } });
    fireEvent.change(screen.getByLabelText('invoices.retentionRate'), {
      target: { value: String(IRPF_RETENTION_RATE.GENERAL) },
    });

    // 1.000,00 base + 210,00 VAT - 150,00 withheld = 1.060,00 to collect
    expect(await screen.findByText('1060,00 €')).toBeInTheDocument();
  });

  it('shows the taxable base when the invoice carries a withholding but no VAT', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'invoices.form.billing-mode.flat' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('invoices.retentionRate'), {
      target: { value: String(IRPF_RETENTION_RATE.GENERAL) },
    });

    expect(await screen.findByText('invoices.base')).toBeInTheDocument();
    expect(screen.getByText('850,00 €')).toBeInTheDocument();
  });
});
