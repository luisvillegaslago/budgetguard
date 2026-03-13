/**
 * BudgetGuard Companies API
 * GET /api/companies - List all companies
 * POST /api/companies - Create a new company
 */

import type { CompanyRole } from '@/constants/finance';
import { CreateCompanySchema } from '@/schemas/company';
import { validateRequest } from '@/schemas/transaction';
import { createCompany, findOrCreateByName, getCompanies } from '@/services/database/CompanyRepository';
import { validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam === null ? undefined : isActiveParam === 'true';
  const roleParam = searchParams.get('role');
  const role = roleParam === 'client' || roleParam === 'provider' ? roleParam : undefined;

  const filters: { isActive?: boolean; role?: CompanyRole } = {};
  if (isActive !== undefined) filters.isActive = isActive;
  if (role !== undefined) filters.role = role;

  const companies = await getCompanies(Object.keys(filters).length > 0 ? filters : undefined);

  return { data: companies };
}, 'GET /api/companies');

export const POST = withApiHandler(async (request) => {
  const body = await request.json();

  // Quick create mode: { name: "..." } with only name field
  const isQuickCreate = Object.keys(body).length === 1 && typeof body.name === 'string';

  if (isQuickCreate) {
    const company = await findOrCreateByName(body.name);
    return { data: company, status: 201 };
  }

  const validation = validateRequest(CreateCompanySchema, body);
  if (!validation.success) {
    return validationError(validation.errors);
  }

  const company = await createCompany(validation.data);

  return { data: company, status: 201 };
}, 'POST /api/companies');
