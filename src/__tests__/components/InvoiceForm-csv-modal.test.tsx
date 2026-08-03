/**
 * Component Tests: the CSV import modal nested inside InvoiceForm.
 *
 * Deliberately keeps the REAL ModalBackdrop: the invoice form traps Escape with a
 * document-level listener (useFocusTrap), so Escape while the import modal was open
 * closed the whole invoice draft. A test that mocks the backdrop away — as
 * InvoiceForm.test.tsx does — cannot see that at all.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockClose = jest.fn();

jest.mock('@/hooks/useInvoices', () => ({
  useInvoicePrefixes: () => ({ data: [{ prefixId: 7, prefix: 'DW', nextNumber: 9, isActive: true }] }),
  useBillingProfile: () => ({ data: { defaultHourlyRateCents: 6000 } }),
  useCreateInvoice: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useUpdateInvoice: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
  useCreateInvoicePrefix: () => ({ mutateAsync: jest.fn(), isPending: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@/components/ui/CompanySelector', () => ({
  CompanySelector: () => null,
}));

jest.mock('@/components/invoices/InlinePrefixForm', () => ({
  InlinePrefixForm: () => null,
}));

import { InvoiceForm } from '@/components/invoices/InvoiceForm';

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
}

function openImportModal() {
  fireEvent.click(screen.getByRole('button', { name: 'invoices.csv.import' }));
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

/** Loads a valid file so the modal's last focusable (the confirm button) is enabled. */
async function uploadCsv() {
  const csv = 'title,subItems,description,hours,hourlyRate,amount\nReservas,,,2,45,';
  await userEvent.upload(fileInput(), new File([csv], 'factura.csv', { type: 'text/csv' }));
  await screen.findByText('invoices.csv.summary');
}

describe('InvoiceForm CSV modal', () => {
  beforeEach(() => {
    mockClose.mockClear();
  });

  it('closes only the import modal on Escape, keeping the invoice draft', () => {
    render(<InvoiceForm onClose={mockClose} />);
    openImportModal();

    expect(screen.getByText('invoices.csv.title')).toBeInTheDocument();

    pressEscape();

    expect(screen.queryByText('invoices.csv.title')).not.toBeInTheDocument();
    expect(mockClose).not.toHaveBeenCalled();
    expect(screen.getByText('invoices.form.title')).toBeInTheDocument();
  });

  it('still closes the invoice form on Escape once the import modal is gone', () => {
    render(<InvoiceForm onClose={mockClose} />);
    openImportModal();
    pressEscape();

    pressEscape();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes the invoice form on Escape when the import modal was never opened', () => {
    render(<InvoiceForm onClose={mockClose} />);

    pressEscape();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab inside the import modal instead of the form behind it', async () => {
    render(<InvoiceForm onClose={mockClose} />);
    openImportModal();
    await uploadCsv();

    const closeButton = screen.getByRole('button', { name: 'common.buttons.close' });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('button', { name: 'invoices.csv.confirm' })).toHaveFocus();
  });

  it('clears the file input so re-picking the same file parses it again', async () => {
    render(<InvoiceForm onClose={mockClose} />);
    openImportModal();
    await uploadCsv();

    expect(fileInput().value).toBe('');
  });

  it('moves focus into the import modal when it opens', () => {
    render(<InvoiceForm onClose={mockClose} />);
    openImportModal();

    expect(screen.getByRole('dialog', { name: 'invoices.csv.title' })).toHaveFocus();
  });
});
