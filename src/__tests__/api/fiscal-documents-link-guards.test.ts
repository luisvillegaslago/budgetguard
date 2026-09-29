/**
 * Integration Tests: fiscal document upload and link-transaction guards
 *
 * Two defects, both driven through the real routes and the real repositories. Only the driver is
 * faked; it answers the ownership query the way Postgres would, from the owners table below.
 *
 *  1. Ids from the upload body must belong to the caller. The document stores companyId,
 *     transactionId and transactionGroupId as given and joins the company back into its display
 *     name, so a foreign companyId read another user's company name, and a missing one surfaced as
 *     an FK 500 that told "exists" apart from "does not exist".
 *  2. link-transaction must not create a second movement over a document the OCR already linked.
 *     Doing so booked the same invoice twice in the 303/130. Replacing the link stays possible, but
 *     only when the request asks for it (the "not this one, create a new one" path), because in the
 *     real cases seen so far the automatic match was the wrong movement.
 */

import type { NextRequest } from 'next/server';
import {
  API_ERROR,
  FISCAL_DOCUMENT_TYPE,
  FISCAL_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
} from '@/constants/finance';

const CALLER = 2;
const OTHER_USER = 1;

// Owner of every row the tests reference, per table. Ids absent here do not exist.
const OWNERS: Record<string, Record<number, number>> = {
  Categories: { 5: OTHER_USER, 15: CALLER },
  Companies: { 8: OTHER_USER, 18: CALLER },
  TransactionGroups: { 4: OTHER_USER, 40: CALLER },
  Transactions: { 7: OTHER_USER, 100: CALLER },
};

const FOREIGN_CATEGORY = 5;
const OWN_CATEGORY = 15;
const FOREIGN_COMPANY = 8;
const OWN_COMPANY = 18;
const MISSING_COMPANY = 999;
const FOREIGN_GROUP = 4;
const OWN_GROUP = 40;
const FOREIGN_TRANSACTION = 7;
const OWN_TRANSACTION = 100;
const NEW_TRANSACTION = 900;
const DOCUMENT_ID = 216;

interface ExecutedStatement {
  sql: string;
  params: unknown[];
}

let executed: ExecutedStatement[] = [];

/** Answers each UNION ALL branch of the ownership check with the ids the user bound at $1 owns. */
function answerOwnershipQuery(sql: string, params: unknown[]): Array<{ Check: number; Id: number }> {
  const userId = params[0];
  return sql.split('UNION ALL').flatMap((branch) => {
    const shape = /SELECT (\d+) AS "Check", "\w+" AS "Id"\s+FROM "(\w+)"[\s\S]*ANY\(\$(\d+)::int\[\]\)/.exec(branch);
    const [, check, table, paramNumber] = shape ?? [];
    if (!check || !table || !paramNumber) throw new Error(`Unexpected ownership branch: ${branch}`);
    const ids = params[Number(paramNumber) - 1] as number[];
    const owners = OWNERS[table] ?? {};
    return ids.filter((id) => owners[id] === userId).map((id) => ({ Check: Number(check), Id: id }));
  });
}

const documentRow = (overrides: Record<string, unknown> = {}) => ({
  DocumentID: DOCUMENT_ID,
  DocumentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
  ModeloType: null,
  FiscalYear: 2026,
  FiscalQuarter: null,
  Status: FISCAL_STATUS.PENDING,
  BlobUrl: 'https://blob.example/fiscal/2/2026/factura.pdf',
  BlobPathname: 'fiscal/2/2026/factura.pdf',
  FileName: 'factura.pdf',
  FileSizeBytes: 1024,
  ContentType: 'application/pdf',
  TaxAmountCents: null,
  TransactionID: null,
  TransactionGroupID: null,
  CompanyID: null,
  Description: null,
  DocumentDate: null,
  VendorName: null,
  DisplayName: 'factura.pdf',
  CreatedAt: '2026-09-10T00:00:00Z',
  ...overrides,
});

const transactionRow = () => ({
  TransactionID: NEW_TRANSACTION,
  CategoryID: OWN_CATEGORY,
  CategoryName: 'Software',
  CategoryIcon: null,
  CategoryColor: null,
  ParentCategoryID: null,
  ParentCategoryName: null,
  AmountCents: 9000,
  Description: 'Anthropic',
  TransactionDate: '2026-09-10',
  Type: TRANSACTION_TYPE.EXPENSE,
  SharedDivisor: 1,
  OriginalAmountCents: null,
  RecurringExpenseID: null,
  TransactionGroupID: null,
  TripID: null,
  TripName: null,
  VatPercent: null,
  DeductionPercent: null,
  VatDeductionPercent: null,
  VendorName: null,
  InvoiceNumber: null,
  Status: TRANSACTION_STATUS.PAID,
  CompanyID: null,
  FiscalDocumentID: DOCUMENT_ID,
  VoucherID: null,
  VoucherUnits: null,
  CreatedAt: '2026-09-10T00:00:00Z',
  UpdatedAt: '2026-09-10T00:00:00Z',
});

/** The document row the SELECT by id returns, set per test. */
let storedDocument = documentRow();

function fakeRows(sql: string, params: unknown[]): unknown[] {
  executed.push({ sql, params });
  if (sql.includes('AS "Check"')) return answerOwnershipQuery(sql, params);
  if (sql.includes('INSERT INTO "FiscalDocuments"')) {
    return [documentRow({ TransactionID: params[12], TransactionGroupID: params[13], CompanyID: params[14] })];
  }
  if (sql.includes('INSERT INTO "Transactions"')) return [{ TransactionID: NEW_TRANSACTION }];
  if (sql.includes('fd."DocumentType"')) return [storedDocument];
  if (sql.includes('FROM "Transactions" t')) return [transactionRow()];
  return [];
}

jest.mock('@/libs/auth', () => ({
  getUserIdOrThrow: jest.fn(async () => 2),
  AuthError: class AuthError extends Error {},
}));

jest.mock('@/services/database/connection', () => ({
  query: jest.fn(async (sql: string, params?: unknown[]) => fakeRows(sql, params ?? [])),
  getPool: jest.fn(),
}));

const mockPut = jest.fn(async (pathname: string) => ({
  url: `https://blob.example/${pathname}`,
  pathname,
}));
jest.mock('@vercel/blob', () => ({
  put: (pathname: string) => mockPut(pathname),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { POST as LINK_TRANSACTION_POST } from '@/app/api/fiscal/documents/[id]/link-transaction/route';
import { POST as UPLOAD_POST } from '@/app/api/fiscal/documents/route';

const statements = (fragment: string) => executed.filter((s) => s.sql.includes(fragment));

/** A multipart upload as the route reads it: one file and the JSON metadata. */
function uploadRequest(metadata: Record<string, unknown>): NextRequest {
  const file = { name: 'factura.pdf', size: 1024, type: 'application/pdf' };
  const fields: Record<string, unknown> = { file, metadata: JSON.stringify(metadata) };
  return { formData: async () => ({ get: (key: string) => fields[key] ?? null }) } as unknown as NextRequest;
}

const invoiceMetadata = (overrides: Record<string, unknown> = {}) => ({
  documentType: FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA,
  modeloType: null,
  fiscalYear: 2026,
  fiscalQuarter: null,
  status: FISCAL_STATUS.PENDING,
  ...overrides,
});

function linkRequest(body: Record<string, unknown>): NextRequest {
  return { url: 'http://localhost:3000/api', json: async () => body } as unknown as NextRequest;
}

const linkBody = (overrides: Record<string, unknown> = {}) => ({
  categoryId: OWN_CATEGORY,
  amountCents: 9000,
  transactionDate: '2026-09-10',
  type: TRANSACTION_TYPE.EXPENSE,
  ...overrides,
});

const linkParams = { params: Promise.resolve({ id: String(DOCUMENT_ID) }) };

beforeEach(() => {
  executed = [];
  mockPut.mockClear();
  storedDocument = documentRow();
});

describe('POST /api/fiscal/documents — ids in the metadata', () => {
  it("rejects another user's company before storing the file", async () => {
    const response = await UPLOAD_POST(uploadRequest(invoiceMetadata({ companyId: FOREIGN_COMPANY })));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.COMPANY });
    expect(mockPut).not.toHaveBeenCalled();
    expect(statements('INSERT INTO "FiscalDocuments"')).toHaveLength(0);
  });

  it('answers a foreign company exactly like one that does not exist', async () => {
    const foreign = await UPLOAD_POST(uploadRequest(invoiceMetadata({ companyId: FOREIGN_COMPANY })));
    const missing = await UPLOAD_POST(uploadRequest(invoiceMetadata({ companyId: MISSING_COMPANY })));

    expect(foreign.status).toBe(missing.status);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("rejects another user's transaction, so it cannot carry a badge for a document that is not theirs", async () => {
    const response = await UPLOAD_POST(uploadRequest(invoiceMetadata({ transactionId: FOREIGN_TRANSACTION })));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.TRANSACTION });
    expect(statements('INSERT INTO "FiscalDocuments"')).toHaveLength(0);
  });

  it("rejects another user's transaction group", async () => {
    const response = await UPLOAD_POST(uploadRequest(invoiceMetadata({ transactionGroupId: FOREIGN_GROUP })));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.GROUP });
    expect(statements('INSERT INTO "FiscalDocuments"')).toHaveLength(0);
  });

  it("stores the document when every id is the caller's own", async () => {
    const response = await UPLOAD_POST(
      uploadRequest(
        invoiceMetadata({ companyId: OWN_COMPANY, transactionId: OWN_TRANSACTION, transactionGroupId: OWN_GROUP }),
      ),
    );

    expect(response.status).toBe(201);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [insert] = statements('INSERT INTO "FiscalDocuments"');
    expect(insert?.params.slice(12, 15)).toEqual([OWN_TRANSACTION, OWN_GROUP, OWN_COMPANY]);
  });

  it('only joins a company that belongs to the same user as the document', async () => {
    await UPLOAD_POST(uploadRequest(invoiceMetadata()));
    await LINK_TRANSACTION_POST(linkRequest(linkBody()), linkParams);

    const companyJoins = executed.flatMap((s) => s.sql.match(/LEFT JOIN "Companies" c ON [^\n]*/g) ?? []);
    expect(companyJoins.length).toBeGreaterThan(0);
    companyJoins.forEach((join) => {
      expect(join).toMatch(/c\."UserID" = (fd|inserted)\."UserID"/);
    });
  });
});

describe('POST /api/fiscal/documents/[id]/link-transaction — an already linked document', () => {
  it('refuses to create a second movement over a transaction the OCR already linked', async () => {
    storedDocument = documentRow({ TransactionID: OWN_TRANSACTION, Status: FISCAL_STATUS.FILED });

    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody()), linkParams);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.CONFLICT.DOCUMENT_ALREADY_LINKED });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
    expect(statements('UPDATE "FiscalDocuments"')).toHaveLength(0);
  });

  it('refuses the same over a linked transaction group', async () => {
    storedDocument = documentRow({ TransactionGroupID: OWN_GROUP, Status: FISCAL_STATUS.FILED });

    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody()), linkParams);

    expect(response.status).toBe(409);
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
  });

  it('replaces a wrong automatic link when the request asks for it explicitly', async () => {
    storedDocument = documentRow({ TransactionID: OWN_TRANSACTION, Status: FISCAL_STATUS.FILED });

    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody({ replaceExistingLink: true })), linkParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { transactionId: NEW_TRANSACTION, documentId: DOCUMENT_ID },
    });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(1);
    const relink = statements('SET "TransactionID"');
    expect(relink).toHaveLength(1);
    expect(relink[0]?.params).toEqual([NEW_TRANSACTION, DOCUMENT_ID, CALLER]);
  });

  it('drops a replaced group link, so the document does not point at two movements', async () => {
    storedDocument = documentRow({ TransactionGroupID: OWN_GROUP, Status: FISCAL_STATUS.FILED });

    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody({ replaceExistingLink: true })), linkParams);

    expect(response.status).toBe(200);
    const [relink] = statements('SET "TransactionID"');
    expect(relink?.sql).toMatch(/"TransactionGroupID" = NULL/);
  });

  it('links an unlinked document without any replace flag', async () => {
    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody()), linkParams);

    expect(response.status).toBe(200);
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(1);
    expect(statements('SET "TransactionID"')).toHaveLength(1);
  });

  it("rejects another user's category and leaves the document untouched", async () => {
    const response = await LINK_TRANSACTION_POST(linkRequest(linkBody({ categoryId: FOREIGN_CATEGORY })), linkParams);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: API_ERROR.NOT_FOUND.CATEGORY });
    expect(statements('INSERT INTO "Transactions"')).toHaveLength(0);
    expect(statements('UPDATE "FiscalDocuments"')).toHaveLength(0);
  });
});
