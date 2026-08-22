/**
 * Component Tests: FiscalDocumentUpload — upload failure message
 *
 * The upload mutation rejects with an i18n KEY (extractApiErrorKey), so the modal must
 * translate it before painting the alert. These tests pin that a rejected upload shows the
 * shipped Spanish copy and never leaks the raw `api-error.mutation.upload.fiscal-document`
 * key, and that a non-Error rejection falls back to that same translated message instead of
 * hardcoded English.
 *
 * The translator is the real es.json dictionary rather than a stub map, so a renamed key
 * breaks the test.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { API_ERROR } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const mockUploadMutateAsync = jest.fn();
const mockExtractMutateAsync = jest.fn();
const mockDeleteMutateAsync = jest.fn();

jest.mock('@/hooks/useFiscalDocuments', () => ({
  useUploadFiscalDocument: () => ({ mutateAsync: mockUploadMutateAsync, isPending: false, errorMessage: null }),
  useExtractDocument: () => ({ mutateAsync: mockExtractMutateAsync, isPending: false, errorMessage: null }),
  useDeleteFiscalDocument: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false, errorMessage: null }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/components/fiscal/FiscalExtractionConfirm', () => ({
  FiscalExtractionConfirm: () => null,
}));

import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';

const TEST_YEAR = 2026;
const UPLOAD_ERROR_KEY = API_ERROR.MUTATION.UPLOAD.FISCAL_DOCUMENT;

function renderModal() {
  return render(<FiscalDocumentUpload year={TEST_YEAR} onClose={jest.fn()} />);
}

/** Pick a file through the hidden input behind the "browse" label, then submit the form. */
function submitWithFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
}

describe('FiscalDocumentUpload — upload failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('translates the i18n key thrown by the upload mutation', async () => {
    mockUploadMutateAsync.mockRejectedValue(new Error(UPLOAD_ERROR_KEY));
    const { container } = renderModal();

    submitWithFile(container);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(translate(UPLOAD_ERROR_KEY));
    // The raw key must never reach the user.
    expect(alert).not.toHaveTextContent(UPLOAD_ERROR_KEY);
  });

  it('falls back to the translated upload message when the rejection is not an Error', async () => {
    mockUploadMutateAsync.mockRejectedValue('boom');
    const { container } = renderModal();

    submitWithFile(container);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(translate(UPLOAD_ERROR_KEY));
    });
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
  });
});
