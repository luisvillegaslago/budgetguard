/**
 * Regression test: JSONB columns must be serialized before being sent as query
 * params during a backup INSERT.
 *
 * Values read from the source DB via SELECT * come back as parsed JS objects/
 * arrays. node-postgres encodes a JS array as a Postgres array literal ({...}),
 * which is invalid JSON input for a jsonb column (error 22P02). Columns listed in
 * TableConfig.jsonColumns must therefore be JSON.stringify'd first.
 */

jest.mock('@/services/database/connection', () => ({ getPool: jest.fn() }));
jest.mock('@/services/database/remoteConnection', () => ({ getBackupPool: jest.fn() }));

import { batchInsert, SYNCABLE_TABLES } from '@/services/database/SyncService';

describe('SyncService JSONB serialization', () => {
  it('JSON.stringifies SubItems (jsonb array) for InvoiceLineItems inserts', async () => {
    const config = SYNCABLE_TABLES.find((c) => c.table === 'InvoiceLineItems');
    if (!config) throw new Error('InvoiceLineItems config missing');

    const subItems = ['Gravity Forms webhooks + shared mailbox poller on Azure', 'Marketing role integration'];
    const row = {
      LineItemID: 89,
      InvoiceID: 16,
      SortOrder: 0,
      Title: 'Leads & Marketing Module',
      SubItems: subItems,
      Description: null,
      Hours: '40.00',
      HourlyRateCents: 6000,
      AmountCents: 240000,
    };

    const query = jest.fn().mockResolvedValue({});
    await batchInsert({ query }, config, [row]);

    expect(query).toHaveBeenCalledTimes(1);
    const params = query.mock.calls[0][1] as unknown[];
    const subItemsParam = params[config.columns.indexOf('SubItems')];

    expect(typeof subItemsParam).toBe('string');
    expect(subItemsParam).toBe(JSON.stringify(subItems));
    // The other (non-json) columns must pass through untouched
    expect(params[config.columns.indexOf('Title')]).toBe('Leads & Marketing Module');
  });

  it('declares jsonColumns for every jsonb-backed syncable table', () => {
    const lineItems = SYNCABLE_TABLES.find((c) => c.table === 'InvoiceLineItems');
    const fiscalDocs = SYNCABLE_TABLES.find((c) => c.table === 'FiscalDocuments');
    expect(lineItems?.jsonColumns).toContain('SubItems');
    expect(fiscalDocs?.jsonColumns).toContain('ExtractedData');
  });
});
