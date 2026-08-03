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
  lineItems: { title: string | null; amountCents: number; hours: number | null; subItems: string[] }[];
  vatPercent: number;
  retentionPercent: number;
}

// Typed input, so the assertions below can read mock.calls[0][0] without casting it back.
const mockCreateInvoice = jest.fn(async (_input: CreateInvoicePayload) => ({ invoiceId: 42 }));

// Mutable so a test can reproduce the query resolving AFTER the form mounted
let mockBillingProfile: { defaultHourlyRateCents: number | null } | undefined;

jest.mock('@/hooks/useInvoices', () => ({
  useInvoicePrefixes: () => ({ data: [{ prefixId: 7, prefix: 'DW', nextNumber: 9, isActive: true }] }),
  useBillingProfile: () => ({ data: mockBillingProfile }),
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

/** Waits for the parsed preview before confirming — the button is rendered disabled meanwhile. */
async function confirmImport() {
  await screen.findByText('invoices.csv.summary');
  fireEvent.click(screen.getByRole('button', { name: 'invoices.csv.confirm' }));
}

/** Two line items: one billed by hours, one at a flat amount. */
function csvFile() {
  const csv = [
    'title,subItems,description,hours,hourlyRate,amount',
    'Reservas,"Endpoint|Solapes",,2,45,',
    'Auditoría,,,,,350',
  ].join('\n');
  return new File([csv], 'factura.csv', { type: 'text/csv' });
}

describe('InvoiceForm', () => {
  beforeEach(() => {
    mockCreateInvoice.mockClear();
    mockBillingProfile = { defaultHourlyRateCents: null };
  });

  it('fills the hourly rate when the billing profile resolves after mount', async () => {
    // useForm freezes defaultValues at mount, so a late profile used to be lost
    mockBillingProfile = undefined;
    const { rerender } = render(<InvoiceForm onClose={jest.fn()} />);

    // Hourly mode renders hours, rate and amount, in that order
    const rateInput = screen.getAllByRole('spinbutton')[1];
    expect(rateInput).toHaveValue(null);

    mockBillingProfile = { defaultHourlyRateCents: 6000 };
    rerender(<InvoiceForm onClose={jest.fn()} />);

    await waitFor(() => expect(rateInput).toHaveValue(60));
  });

  it('keeps a rate the user typed while the billing profile was loading', async () => {
    mockBillingProfile = undefined;
    const { rerender } = render(<InvoiceForm onClose={jest.fn()} />);

    const rateInput = screen.getAllByRole('spinbutton')[1] as HTMLInputElement;
    fireEvent.change(rateInput, { target: { value: '75' } });

    mockBillingProfile = { defaultHourlyRateCents: 6000 };
    rerender(<InvoiceForm onClose={jest.fn()} />);

    await waitFor(() => expect(rateInput).toHaveValue(75));
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

  it('appends the CSV line items and drops the blank row the form opens with', async () => {
    const { container } = render(<InvoiceForm onClose={jest.fn()} />);

    await fillHeader();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.csv.import' }));

    const input = container.querySelector('input[type="file"]');
    await userEvent.upload(input as HTMLInputElement, csvFile());

    await confirmImport();
    submit();

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledTimes(1));

    const payload = mockCreateInvoice.mock.calls[0]?.[0];
    expect(payload?.lineItems).toHaveLength(2);
    expect(payload?.lineItems[0]).toMatchObject({ title: 'Reservas', hours: 2, amountCents: 9000 });
    expect(payload?.lineItems[0]?.subItems).toEqual(['Endpoint', 'Solapes']);
    expect(payload?.lineItems[1]).toMatchObject({ title: 'Auditoría', hours: null, amountCents: 35000 });
  });

  it('parses a CSV dropped on the import modal', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    await fillHeader();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.csv.import' }));

    const dropzone = screen.getByRole('button', { name: /invoices\.csv\.drop-hint/ });
    fireEvent.drop(dropzone, { dataTransfer: { files: [csvFile()] } });

    await confirmImport();
    submit();

    await waitFor(() => expect(mockCreateInvoice).toHaveBeenCalledTimes(1));
    expect(mockCreateInvoice.mock.calls[0]?.[0]?.lineItems).toHaveLength(2);
  });

  it('closes only the import modal on Escape, leaving the invoice form open', async () => {
    render(<InvoiceForm onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'invoices.csv.import' }));
    expect(screen.getByText('invoices.csv.title')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByText('invoices.csv.title'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('invoices.csv.title')).not.toBeInTheDocument());
    expect(screen.getByText('invoices.form.title')).toBeInTheDocument();
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
