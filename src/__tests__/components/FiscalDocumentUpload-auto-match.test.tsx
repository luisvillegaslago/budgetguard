/**
 * Integration Tests: invoice upload when the OCR auto-links an existing movement
 *
 * The extract route stores the link and reports it in `meta`. The hook used to return only `data`,
 * so the confirmation modal never knew about the link and its one button created a second movement
 * for the same invoice: a deductible expense counted twice in the 303/130.
 *
 * Driven through the real hooks, the real upload modal and the real confirmation modal; only the
 * HTTP layer is faked. Strings come from the real es.json, so a missing key fails the test.
 *
 * Both choices must survive: in the real cases seen so far (docs 205 and 216) the match was an
 * unrelated movement with the same amount, and creating a new one was the right call.
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { API_ENDPOINT, TRANSACTION_STATUS, TRANSACTION_TYPE } from '@/constants/finance';
import { createTranslator } from '@/libs/i18n';
import es from '@/messages/es.json';
import type { ExtractionAutoMatch } from '@/types/finance';

const translate = createTranslator(es as unknown as Record<string, unknown>);

const DOCUMENT_ID = 216;
const MATCHED_TRANSACTION_ID = 3741;
const MATCHED_GROUP_ID = 40;
const NEW_TRANSACTION_ID = 3745;
const OWN_CATEGORY = 15;

const EXTRACTED = {
  totalAmountCents: 9000,
  baseAmountCents: 7438,
  taxAmountCents: 1562,
  vatPercent: 21,
  date: '2026-03-02',
  vendor: 'Anthropic',
  invoiceNumber: 'INV-1',
  description: 'Claude Pro',
  confidence: 0.95,
};

const MATCHED_TRANSACTION = {
  transactionId: MATCHED_TRANSACTION_ID,
  amountCents: 9000,
  description: 'Cuota Ragnarok',
  vendorName: null,
  transactionDate: '2026-03-01',
  type: TRANSACTION_TYPE.EXPENSE,
  sharedDivisor: 1,
  originalAmountCents: null,
  status: TRANSACTION_STATUS.PAID,
  category: { categoryId: OWN_CATEGORY, name: 'Gimnasio' },
};

const GROUP_TRANSACTIONS = [
  { ...MATCHED_TRANSACTION, transactionId: 1, amountCents: 4500, description: 'Primer cargo' },
  { ...MATCHED_TRANSACTION, transactionId: 2, amountCents: 4500, description: 'Segundo cargo' },
];

interface FakeCall {
  url: string;
  method: string;
  body: unknown;
}

let calls: FakeCall[] = [];
/** The `meta` the fake extract answers with, set per test. */
let extractMeta: ExtractionAutoMatch = {};

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

function answer(url: string, method: string) {
  if (method === 'POST' && url === API_ENDPOINT.FISCAL_DOCUMENTS) {
    return jsonResponse(201, { success: true, data: { documentId: DOCUMENT_ID } });
  }
  if (url.startsWith(`${API_ENDPOINT.FISCAL_DOCUMENTS}/${DOCUMENT_ID}/extract`)) {
    return jsonResponse(200, { success: true, data: EXTRACTED, meta: extractMeta });
  }
  if (url === `${API_ENDPOINT.TRANSACTIONS}/${MATCHED_TRANSACTION_ID}`) {
    return jsonResponse(200, { success: true, data: MATCHED_TRANSACTION });
  }
  if (url === `${API_ENDPOINT.TRANSACTION_GROUPS}/${MATCHED_GROUP_ID}`) {
    return jsonResponse(200, { success: true, data: GROUP_TRANSACTIONS });
  }
  if (url === `${API_ENDPOINT.FISCAL_DOCUMENTS}/${DOCUMENT_ID}/link-transaction`) {
    return jsonResponse(200, { success: true, data: { transactionId: NEW_TRANSACTION_ID, documentId: DOCUMENT_ID } });
  }
  throw new Error(`Unexpected request ${method} ${url}`);
}

jest.mock('@/utils/fetchApi', () => ({
  fetchApi: jest.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url: input, method, body });
    return answer(input, method);
  }),
}));

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({
    t: (key: string, values?: Record<string, string | number | boolean>) => translate(key, values),
    locale: 'es',
    setLocale: jest.fn(),
  }),
}));

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: [] }),
  useCategoriesHierarchical: () => ({ data: [] }),
}));

jest.mock('@/hooks/useCompanies', () => ({
  useCompanies: () => ({ data: [] }),
  useQuickCreateCompany: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// The category combobox has its own tests; here it only has to hand the modal an id.
jest.mock('@/components/transactions/CategorySelector', () => ({
  CategorySelector: ({ onCategoryChange }: { onCategoryChange: (id: number) => void }) => (
    <button type="button" onClick={() => onCategoryChange(15)}>
      pick-category
    </button>
  ),
}));

import { FiscalDocumentUpload } from '@/components/fiscal/FiscalDocumentUpload';
import { useExtractDocument } from '@/hooks/useFiscalDocuments';

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderUpload(onClose: () => void) {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <FiscalDocumentUpload year={2026} onClose={onClose} />
    </QueryClientProvider>,
  );
}

/** Pick a file through the hidden input and submit: upload, then the automatic extract. */
function uploadInvoice(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['%PDF-1.4'], 'anthropic.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
}

const linkCalls = () => calls.filter((call) => call.url.endsWith('/link-transaction'));
const button = (key: string) => screen.getByRole('button', { name: translate(key) });

beforeEach(() => {
  calls = [];
  extractMeta = {};
});

describe('useExtractDocument', () => {
  it('returns the auto-link in meta alongside the extracted data', async () => {
    extractMeta = { matchedTransactionId: MATCHED_TRANSACTION_ID };
    const client = newQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useExtractDocument(), { wrapper });

    const extracted = await result.current.mutateAsync({ documentId: DOCUMENT_ID, locale: 'es' });

    expect(extracted).toEqual({ data: EXTRACTED, meta: { matchedTransactionId: MATCHED_TRANSACTION_ID } });
  });
});

describe('FiscalDocumentUpload — the OCR linked an existing movement', () => {
  it('shows the linked movement instead of offering to create one', async () => {
    extractMeta = { matchedTransactionId: MATCHED_TRANSACTION_ID };
    const { container } = renderUpload(jest.fn());

    uploadInvoice(container);

    expect(await screen.findByText(translate('fiscal.extraction.auto-match.title'))).toBeInTheDocument();
    expect(await screen.findByText('Cuota Ragnarok')).toBeInTheDocument();
    expect(button('fiscal.extraction.auto-match.keep')).toBeInTheDocument();
    expect(button('fiscal.extraction.auto-match.create-new')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: translate('fiscal.extraction.create-transaction') })).toBeNull();
  });

  it('keeping the link closes without creating anything', async () => {
    extractMeta = { matchedTransactionId: MATCHED_TRANSACTION_ID };
    const onClose = jest.fn();
    const { container } = renderUpload(onClose);

    uploadInvoice(container);
    fireEvent.click(await screen.findByRole('button', { name: translate('fiscal.extraction.auto-match.keep') }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(linkCalls()).toHaveLength(0);
  });

  it('"not this one" opens the form and asks the server to replace the link', async () => {
    extractMeta = { matchedTransactionId: MATCHED_TRANSACTION_ID };
    const onClose = jest.fn();
    const { container } = renderUpload(onClose);

    uploadInvoice(container);
    fireEvent.click(await screen.findByRole('button', { name: translate('fiscal.extraction.auto-match.create-new') }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-category' }));
    fireEvent.click(button('fiscal.extraction.create-transaction'));

    await waitFor(() => expect(linkCalls()).toHaveLength(1));
    expect(linkCalls()[0]?.body).toEqual(
      expect.objectContaining({ categoryId: OWN_CATEGORY, amountCents: 9000, replaceExistingLink: true }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('reviews a linked group the same way', async () => {
    extractMeta = { matchedGroupId: MATCHED_GROUP_ID };
    const { container } = renderUpload(jest.fn());

    uploadInvoice(container);

    expect(await screen.findByText('Primer cargo')).toBeInTheDocument();
    expect(screen.getByText('Segundo cargo')).toBeInTheDocument();
    expect(button('fiscal.extraction.auto-match.keep')).toBeInTheDocument();
  });
});

describe('FiscalDocumentUpload — nothing matched', () => {
  it('goes straight to the form and does not ask to replace anything', async () => {
    const { container } = renderUpload(jest.fn());

    uploadInvoice(container);
    fireEvent.click(await screen.findByRole('button', { name: 'pick-category' }));
    fireEvent.click(button('fiscal.extraction.create-transaction'));

    await waitFor(() => expect(linkCalls()).toHaveLength(1));
    expect(linkCalls()[0]?.body).toEqual(expect.objectContaining({ replaceExistingLink: false }));
    expect(screen.queryByText(translate('fiscal.extraction.auto-match.title'))).toBeNull();
  });
});
