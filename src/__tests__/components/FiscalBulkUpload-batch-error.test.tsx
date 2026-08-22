/**
 * Component Tests: FiscalBulkUpload
 * Pins two rules the modal used to break:
 * - a failed batch reports a translated key, never a hardcoded English string;
 * - the pre-upload preview labels modelos by comparing against FISCAL_DOCUMENT_TYPE.MODELO,
 *   so a renamed constant value cannot silently relabel every modelo as "Factura".
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FiscalBulkUpload } from '@/components/fiscal/FiscalBulkUpload';
import { FISCAL_DOCUMENT_TYPE, MODELO_TYPE } from '@/constants/finance';
import { parseDocumentFilename } from '@/utils/fiscalFileParser';

const mockBulkMutateAsync = jest.fn();

jest.mock('@/hooks/useFiscalDocuments', () => ({
  useBulkUploadDocuments: () => ({
    mutateAsync: mockBulkMutateAsync,
    isPending: false,
    isError: false,
    errorMessage: null,
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    // Echo the key plus interpolated values so assertions can target both.
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join('|')}` : key),
    locale: 'es',
  }),
}));

const MODELO_FILE = '303 1T 2026.pdf';
const FACTURA_FILE = 'vodafone enero 2026.pdf';
const BATCH_FAILED_KEY = 'fiscal.documents.errors.batch-failed';

function makeFile(name: string): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function selectFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

function clickUpload() {
  fireEvent.click(screen.getByText(/fiscal\.documents\.bulk-upload-submit:/));
}

describe('FiscalBulkUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('failed batch', () => {
    it('reports the translated key for every file, never the hardcoded "Batch failed"', async () => {
      mockBulkMutateAsync.mockRejectedValue(new Error('network down'));
      const { container } = render(<FiscalBulkUpload onClose={jest.fn()} />);

      selectFiles(container, [makeFile(MODELO_FILE), makeFile(FACTURA_FILE)]);
      clickUpload();

      await waitFor(() => {
        expect(screen.getByText(`${MODELO_FILE}: ${BATCH_FAILED_KEY}`)).toBeInTheDocument();
      });
      expect(screen.getByText(`${FACTURA_FILE}: ${BATCH_FAILED_KEY}`)).toBeInTheDocument();
      expect(screen.queryByText(/Batch failed/)).not.toBeInTheDocument();
    });
  });

  describe('pre-upload preview', () => {
    it('labels a modelo with its type and quarter, and a non-modelo as factura', () => {
      const { container } = render(<FiscalBulkUpload onClose={jest.fn()} />);

      selectFiles(container, [makeFile(MODELO_FILE), makeFile(FACTURA_FILE)]);

      // Guards the fixtures: the branch under test keys off documentType.
      expect(parseDocumentFilename(MODELO_FILE).documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(parseDocumentFilename(FACTURA_FILE).documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);

      expect(screen.getByText(`M${MODELO_TYPE.M303} Q1 2026`)).toBeInTheDocument();
      expect(screen.getByText('fiscal.documents.types.factura')).toBeInTheDocument();
    });
  });
});
