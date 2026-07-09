/**
 * Integration Tests: ModeloDocumentUpload — AI detection cascade
 * Covers the filename-first cost-saving cascade, the state reset between files
 * (no metadata may leak from a previous selection), the out-of-range fiscal year
 * fallback, and the "detected" banner never labelling a manual pick as detected.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModeloDocumentUpload } from '@/components/fiscal/ModeloDocumentUpload';
import { FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import type { DetectedModeloData, FiscalDocument } from '@/types/finance';

const mockDetectMutateAsync = jest.fn();
const mockUploadMutateAsync = jest.fn();
const mockDetectReset = jest.fn();

/** Modelos already archived for the selected year. Mutated per test. */
let existingModelos: Partial<FiscalDocument>[] = [];

jest.mock('@/hooks/useFiscalDocuments', () => ({
  useDetectModelo: () => ({
    mutateAsync: mockDetectMutateAsync,
    reset: mockDetectReset,
    isPending: false,
    isError: false,
    errorMessage: null,
  }),
  useUploadFiscalDocument: () => ({
    mutateAsync: mockUploadMutateAsync,
    isPending: false,
    isError: false,
    errorMessage: null,
  }),
  useFiscalDocuments: () => ({ data: existingModelos }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    // Echo the key plus interpolated values so assertions can target both.
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join('|')}` : key),
    locale: 'es',
  }),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

const DEFAULT_YEAR = 2026;
const DEFAULT_QUARTER = 2;
const DETECTED_BANNER = /fiscal\.modelo-upload\.detected:/;

function makeFile(name: string): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function detection(overrides: Partial<DetectedModeloData> = {}): DetectedModeloData {
  return {
    modeloType: null,
    fiscalYear: null,
    fiscalQuarter: null,
    resultAmountCents: null,
    confidence: 0.2,
    ...overrides,
  };
}

function renderModal() {
  return render(
    <ModeloDocumentUpload defaultYear={DEFAULT_YEAR} defaultQuarter={DEFAULT_QUARTER} onClose={jest.fn()} />,
  );
}

/** The hidden file input behind the "browse" label. Only rendered while no file is selected. */
function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

/**
 * Drop a file on the drop zone. This is the only way to replace an already
 * selected file without clearing it first, since the input is hidden by then.
 */
function dropFile(container: HTMLElement, file: File) {
  const dropZone = container.querySelector('.border-dashed') as HTMLElement;
  fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
}

function modeloSelect(): HTMLSelectElement {
  return screen.getByLabelText('fiscal.modelo-upload.fields.modelo') as HTMLSelectElement;
}

function yearSelect(): HTMLSelectElement {
  return screen.getByLabelText('fiscal.modelo-upload.fields.year') as HTMLSelectElement;
}

function quarterSelect(): HTMLSelectElement {
  return screen.getByLabelText('fiscal.modelo-upload.fields.quarter') as HTMLSelectElement;
}

/** The X button rendered next to the selected filename inside the drop zone. */
function clearFileButton(fileName: string): HTMLButtonElement {
  const label = screen.getByText(fileName);
  const button = label.parentElement?.querySelector('button');
  if (!button) throw new Error(`No clear button next to ${fileName}`);
  return button as HTMLButtonElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  existingModelos = [];
});

describe('ModeloDocumentUpload — filename cascade', () => {
  it('fills the form from the filename without calling the AI', async () => {
    const { container } = renderModal();

    selectFile(container, makeFile('303 1T 2024.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M303));
    expect(yearSelect().value).toBe('2024');
    expect(quarterSelect().value).toBe('1');
    // The whole point of the cascade: a recognisable filename costs zero tokens.
    expect(mockDetectMutateAsync).not.toHaveBeenCalled();
  });

  it('falls back to the default year when the filename carries an unselectable year', async () => {
    const { container } = renderModal();

    // 2018 predates MIN_YEAR (2019), so it has no <option> and must not be applied.
    selectFile(container, makeFile('303 1T 2018.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M303));
    expect(yearSelect().value).toBe(String(DEFAULT_YEAR));
  });

  it('calls the AI when the filename identifies nothing', async () => {
    mockDetectMutateAsync.mockResolvedValue(
      detection({ modeloType: MODELO_TYPE.M130, fiscalYear: 2026, fiscalQuarter: 3, confidence: 0.95 }),
    );
    const { container } = renderModal();

    selectFile(container, makeFile('descarga.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M130));
    expect(mockDetectMutateAsync).toHaveBeenCalledTimes(1);
    expect(quarterSelect().value).toBe('3');
  });

  it('ignores an AI-detected year outside the selectable range', async () => {
    mockDetectMutateAsync.mockResolvedValue(
      detection({ modeloType: MODELO_TYPE.M303, fiscalYear: 1999, fiscalQuarter: 1, confidence: 0.9 }),
    );
    const { container } = renderModal();

    selectFile(container, makeFile('descarga.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M303));
    expect(yearSelect().value).toBe(String(DEFAULT_YEAR));
  });
});

describe('ModeloDocumentUpload — state reset between files', () => {
  it('does not leak metadata from a previously selected file', async () => {
    // Second file is an invoice: the AI recognises nothing.
    mockDetectMutateAsync.mockResolvedValue(detection());
    const { container } = renderModal();

    // 1. A recognisable modelo pre-fills 303 / 2024 / Q1.
    selectFile(container, makeFile('303 1T 2024.pdf'));
    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M303));

    // 2. The user drags a different, unrecognisable file on top of it.
    dropFile(container, makeFile('escaneo.pdf'));

    // 3. Nothing from the first file may survive, or the invoice would be filed as a 303.
    await waitFor(() => expect(screen.getByText('fiscal.modelo-upload.not-detected')).toBeInTheDocument());
    expect(modeloSelect().value).toBe('');
    expect(yearSelect().value).toBe(String(DEFAULT_YEAR));
  });

  it('clears detected metadata when the file is removed', async () => {
    const { container } = renderModal();

    selectFile(container, makeFile('390 2024.pdf'));
    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M390));

    fireEvent.click(clearFileButton('390 2024.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(''));
    expect(yearSelect().value).toBe(String(DEFAULT_YEAR));
  });
});

describe('ModeloDocumentUpload — duplicate warning', () => {
  const filed303Q2: Partial<FiscalDocument> = {
    documentId: 249,
    modeloType: MODELO_TYPE.M303,
    fiscalYear: 2026,
    fiscalQuarter: 2,
    status: FISCAL_STATUS.FILED,
  };

  it('warns when the same modelo and period is already filed', async () => {
    existingModelos = [filed303Q2];
    mockDetectMutateAsync.mockResolvedValue(
      detection({ modeloType: MODELO_TYPE.M303, fiscalYear: 2026, fiscalQuarter: 2, confidence: 0.99 }),
    );
    const { container } = renderModal();

    selectFile(container, makeFile('descarga.pdf'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toContain('fiscal.modelo-upload.already-filed');
    // Warn, never block: a complementaria is a legitimate second document.
    const submit = screen.getByRole('button', { name: 'fiscal.modelo-upload.upload-anyway' });
    expect(submit).toBeEnabled();
  });

  it('does not warn for a different quarter of the same modelo', async () => {
    existingModelos = [filed303Q2];
    const { container } = renderModal();

    // Q1, while only Q2 is filed.
    selectFile(container, makeFile('303 1T 2026.pdf'));

    await waitFor(() => expect(quarterSelect().value).toBe('1'));
    expect(screen.queryByText(/already-filed/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fiscal.documents.upload-submit' })).toBeInTheDocument();
  });

  it('does not warn when the existing document is only pending', async () => {
    existingModelos = [{ ...filed303Q2, status: FISCAL_STATUS.PENDING }];
    const { container } = renderModal();

    selectFile(container, makeFile('303 2T 2026.pdf'));

    await waitFor(() => expect(modeloSelect().value).toBe(MODELO_TYPE.M303));
    expect(screen.queryByText(/already-filed/)).not.toBeInTheDocument();
  });

  it('warns for an annual modelo already filed (null quarter)', async () => {
    existingModelos = [
      {
        documentId: 300,
        modeloType: MODELO_TYPE.M390,
        fiscalYear: 2026,
        fiscalQuarter: null,
        status: FISCAL_STATUS.FILED,
      },
    ];
    const { container } = renderModal();

    selectFile(container, makeFile('390 2026.pdf'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toContain('fiscal.modelo-upload.already-filed');
  });
});

describe('ModeloDocumentUpload — detected banner honesty', () => {
  it('shows the detected banner for an auto-detected modelo', async () => {
    const { container } = renderModal();

    selectFile(container, makeFile('303 1T 2024.pdf'));

    await waitFor(() => expect(screen.getByText(DETECTED_BANNER)).toBeInTheDocument());
  });

  it('does not label a manual selection as detected', async () => {
    mockDetectMutateAsync.mockResolvedValue(detection());
    const { container } = renderModal();

    selectFile(container, makeFile('descarga.pdf'));
    await waitFor(() => expect(screen.getByText('fiscal.modelo-upload.not-detected')).toBeInTheDocument());

    // The user picks the modelo by hand.
    fireEvent.change(modeloSelect(), { target: { value: MODELO_TYPE.M303 } });

    expect(screen.queryByText(DETECTED_BANNER)).not.toBeInTheDocument();
    // The amber hint retires once the user has taken over.
    expect(screen.queryByText('fiscal.modelo-upload.not-detected')).not.toBeInTheDocument();
  });

  it('hides the confidence badge once the user overrides the detected modelo', async () => {
    mockDetectMutateAsync.mockResolvedValue(
      detection({ modeloType: MODELO_TYPE.M303, fiscalYear: 2026, fiscalQuarter: 2, confidence: 0.99 }),
    );
    const { container } = renderModal();

    selectFile(container, makeFile('descarga.pdf'));
    await waitFor(() => expect(screen.getByText('fiscal.extraction.confidence')).toBeInTheDocument());
    expect(screen.getByText('99%')).toBeInTheDocument();

    // Switching modelo by hand: the 99% belonged to the 303, not to this pick.
    fireEvent.change(modeloSelect(), { target: { value: MODELO_TYPE.M130 } });

    expect(screen.queryByText('fiscal.extraction.confidence')).not.toBeInTheDocument();
    expect(screen.queryByText('99%')).not.toBeInTheDocument();
  });
});
