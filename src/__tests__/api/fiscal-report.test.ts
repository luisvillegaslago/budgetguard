/**
 * Integration Tests: Fiscal Report API
 * Tests GET /api/fiscal?year=2025&quarter=1
 * Validates parameter validation, repository delegation, and error handling
 */

import { TRANSACTION_TYPE } from '@/constants/finance';
import type { FiscalTransaction, Modelo130Summary, Modelo303Summary } from '@/types/finance';

// ── Mock Data ──

const mockModelo303: Modelo303Summary = {
  fiscalYear: 2025,
  fiscalQuarter: 1,
  casilla07Cents: 0,
  casilla09Cents: 0,
  casilla27Cents: 0,
  casilla28Cents: 13101,
  casilla29Cents: 2751,
  casilla45Cents: 2751,
  casilla60Cents: 1957615,
  resultCents: -2751,
};

const mockModelo130: Modelo130Summary = {
  fiscalYear: 2025,
  fiscalQuarter: 1,
  casilla1Cents: 1957615,
  casilla2Cents: 289854,
  casilla3Cents: 1667761,
  casilla4Cents: 333552,
  casilla5Cents: 0,
  casilla7Cents: 333552,
  gastosDocumentadosCents: 191973,
  gastosDificilCents: 97881,
};

const mockExpenses: FiscalTransaction[] = [
  {
    transactionId: 101,
    transactionDate: '2025-01-15',
    categoryName: 'Material oficina',
    parentCategoryName: 'Gastos deducibles',
    vendorName: 'Papeleria Central',
    invoiceNumber: 'FAC-2025-001',
    description: 'Toner impresora laser',
    type: TRANSACTION_TYPE.EXPENSE,
    fullAmountCents: 4840,
    vatPercent: 21,
    deductionPercent: 100,
    baseCents: 4000,
    ivaCents: 840,
    baseDeducibleCents: 4000,
    ivaDeducibleCents: 840,
  },
  {
    transactionId: 102,
    transactionDate: '2025-02-20',
    categoryName: 'Software',
    parentCategoryName: 'Gastos deducibles',
    vendorName: 'JetBrains s.r.o.',
    invoiceNumber: 'JB-2025-9812',
    description: 'Licencia IntelliJ IDEA anual',
    type: TRANSACTION_TYPE.EXPENSE,
    fullAmountCents: 14520,
    vatPercent: 21,
    deductionPercent: 50,
    baseCents: 12000,
    ivaCents: 2520,
    baseDeducibleCents: 6000,
    ivaDeducibleCents: 1260,
  },
];

const mockInvoices: FiscalTransaction[] = [
  {
    transactionId: 201,
    transactionDate: '2025-01-31',
    categoryName: 'Desarrollo web',
    parentCategoryName: 'Ingresos profesionales',
    vendorName: 'Acme Corp S.L.',
    invoiceNumber: '2025-F001',
    description: 'Desarrollo aplicacion React - enero',
    type: TRANSACTION_TYPE.INCOME,
    fullAmountCents: 363000,
    vatPercent: 21,
    deductionPercent: 100,
    baseCents: 300000,
    ivaCents: 63000,
    baseDeducibleCents: 300000,
    ivaDeducibleCents: 63000,
  },
  {
    transactionId: 202,
    transactionDate: '2025-03-15',
    categoryName: 'Consultoria',
    parentCategoryName: 'Ingresos profesionales',
    vendorName: 'Beta Industries S.A.',
    invoiceNumber: '2025-F002',
    description: 'Consultoria arquitectura cloud - marzo',
    type: TRANSACTION_TYPE.INCOME,
    fullAmountCents: 181500,
    vatPercent: 21,
    deductionPercent: 100,
    baseCents: 150000,
    ivaCents: 31500,
    baseDeducibleCents: 150000,
    ivaDeducibleCents: 31500,
  },
];

// ── Mocks ──

const mockGetFiscalExpenses = jest.fn();
const mockGetFiscalInvoices = jest.fn();
const mockGetModelo303Summary = jest.fn();
const mockGetModelo130Summary = jest.fn();

jest.mock('@/services/database/FiscalRepository', () => ({
  getFiscalExpenses: (...args: [number, number]) => mockGetFiscalExpenses(...args),
  getFiscalInvoices: (...args: [number, number]) => mockGetFiscalInvoices(...args),
  getModelo303Summary: (...args: [number, number]) => mockGetModelo303Summary(...args),
  getModelo130Summary: (...args: [number, number]) => mockGetModelo130Summary(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, options?: { status?: number }) => ({
      status: options?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '@/app/api/fiscal/route';

// ── Helpers ──

function createMockRequest(url: string): { url: string } {
  return { url };
}

// ── Tests ──

describe('GET /api/fiscal', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetModelo303Summary.mockResolvedValue(mockModelo303);
    mockGetModelo130Summary.mockResolvedValue(mockModelo130);
    mockGetFiscalExpenses.mockResolvedValue(mockExpenses);
    mockGetFiscalInvoices.mockResolvedValue(mockInvoices);
  });

  // ── Success ──

  it('should return fiscal report for valid year and quarter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?year=2025&quarter=1');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fiscalYear).toBe(2025);
    expect(body.data.fiscalQuarter).toBe(1);
    expect(body.data.modelo303).toEqual(mockModelo303);
    expect(body.data.modelo130).toEqual(mockModelo130);
    expect(body.data.expenses).toEqual(mockExpenses);
    expect(body.data.invoices).toEqual(mockInvoices);
  });

  it('should call all 4 repository functions with correct year and quarter params', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?year=2025&quarter=3');
    await GET(request as never);

    expect(mockGetModelo303Summary).toHaveBeenCalledTimes(1);
    expect(mockGetModelo303Summary).toHaveBeenCalledWith(2025, 3);

    expect(mockGetModelo130Summary).toHaveBeenCalledTimes(1);
    expect(mockGetModelo130Summary).toHaveBeenCalledWith(2025, 3);

    expect(mockGetFiscalExpenses).toHaveBeenCalledTimes(1);
    expect(mockGetFiscalExpenses).toHaveBeenCalledWith(2025, 3);

    expect(mockGetFiscalInvoices).toHaveBeenCalledTimes(1);
    expect(mockGetFiscalInvoices).toHaveBeenCalledWith(2025, 3);
  });

  // ── Validation: missing parameters ──

  it('should return 400 for missing year parameter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?quarter=1');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
  });

  it('should return 400 for missing quarter parameter', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?year=2025');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
  });

  // ── Validation: invalid values ──

  it('should return 400 for invalid quarter (quarter=5)', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?year=2025&quarter=5');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
  });

  it('should return 400 for invalid year (year=1999, below minimum 2020)', async () => {
    const request = createMockRequest('http://localhost:3000/api/fiscal?year=1999&quarter=1');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toBeDefined();
  });

  // ── Error handling ──

  it('should return 500 when repository throws an error', async () => {
    mockGetModelo303Summary.mockRejectedValue(new Error('Database connection failed'));

    const request = createMockRequest('http://localhost:3000/api/fiscal?year=2025&quarter=1');
    const response = await GET(request as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Error al obtener informe fiscal');
  });
});
