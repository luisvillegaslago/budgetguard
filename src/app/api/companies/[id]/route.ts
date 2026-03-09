/**
 * BudgetGuard Company API - Single Resource
 * GET /api/companies/[id] - Get a company
 * PUT /api/companies/[id] - Update a company
 * DELETE /api/companies/[id] - Soft-delete a company
 */

import { UpdateCompanySchema } from '@/schemas/company';
import { validateRequest } from '@/schemas/transaction';
import {
  deleteCompany,
  getCompanyById,
  getCompanyUsageCount,
  updateCompany,
} from '@/services/database/CompanyRepository';
import { notFound, parseIdParam, validationError, withApiHandler } from '@/utils/apiHandler';

export const GET = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const companyId = parseIdParam(id);
  if (typeof companyId !== 'number') return companyId;

  const company = await getCompanyById(companyId);
  if (!company) return notFound('Company not found');

  return { data: company };
}, 'GET /api/companies/[id]');

export const PUT = withApiHandler(async (request, { params }) => {
  const { id } = await params;
  const companyId = parseIdParam(id);
  if (typeof companyId !== 'number') return companyId;

  const body = await request.json();
  const validation = validateRequest(UpdateCompanySchema, body);
  if (!validation.success) return validationError(validation.errors);

  const company = await updateCompany(companyId, validation.data);
  if (!company) return notFound('Company not found');

  return { data: company };
}, 'PUT /api/companies/[id]');

export const DELETE = withApiHandler(async (_request, { params }) => {
  const { id } = await params;
  const companyId = parseIdParam(id);
  if (typeof companyId !== 'number') return companyId;

  const usageCount = await getCompanyUsageCount(companyId);

  const deleted = await deleteCompany(companyId);
  if (!deleted) return notFound('Company not found');

  return { data: { deleted: true, usageCount } };
}, 'DELETE /api/companies/[id]');
