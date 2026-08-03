/**
 * Unit tests for the invoice line-item CSV parser (src/utils/invoiceCsv.ts).
 *
 * Pure function, no DB. Covers: header aliases, sub-item packing, hourly vs flat
 * rows, the billing-profile rate fallback, per-row validation and the line-item
 * ceiling shared with InvoiceLineItemSchema.
 */

import { INVOICE_CSV_ERROR, INVOICE_LINE_ITEM_LIMIT } from '@/constants/finance';
import { parseInvoiceCsv } from '@/utils/invoiceCsv';

const HEADER = 'title,subItems,description,hours,hourlyRate,amount';

function buildCsv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseInvoiceCsv', () => {
  describe('hourly rows', () => {
    it('computes the amount from hours × rate', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,12.5,45,'));

      expect(result.issues).toEqual([]);
      expect(result.items).toEqual([
        { title: 'Reservas', subItems: [], description: '', hours: 12.5, hourlyRateCents: 4500, amountCents: 56250 },
      ]);
    });

    it('falls back to the billing profile rate when the column is empty', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,4,,'), { defaultHourlyRateCents: 5000 });

      expect(result.issues).toEqual([]);
      expect(result.items[0]?.hourlyRateCents).toBe(5000);
      expect(result.items[0]?.amountCents).toBe(20000);
    });

    it('rejects hours with no rate and no profile default', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,4,,'));

      expect(result.items).toEqual([]);
      expect(result.issues).toEqual([
        { line: 2, messageKey: INVOICE_CSV_ERROR.HOURLY_RATE_REQUIRED, params: undefined },
      ]);
    });

    it('accepts an explicit amount that matches hours × rate', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,12.5,45,562.50'));

      expect(result.issues).toEqual([]);
      expect(result.items[0]?.amountCents).toBe(56250);
    });

    it('flags an explicit amount that contradicts hours × rate', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,12.5,45,600'));

      expect(result.items).toEqual([]);
      expect(result.issues[0]).toMatchObject({ line: 2, messageKey: INVOICE_CSV_ERROR.AMOUNT_MISMATCH });
    });

    it('tolerates a one-cent rounding difference and keeps the computed amount', () => {
      // 1,5 h × 33,33 €/h = 49,995 → we round to 50,00, a sheet may have written 49,99
      const result = parseInvoiceCsv(buildCsv('Reservas,,,1.5,33.33,49.99'));

      expect(result.issues).toEqual([]);
      expect(result.items[0]?.amountCents).toBe(5000);
    });
  });

  describe('flat rows', () => {
    it('takes the amount as-is and drops a rate given without hours', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,Informe de rendimiento,,45,350'));

      expect(result.issues).toEqual([]);
      expect(result.items[0]).toEqual({
        title: 'Auditoría',
        subItems: [],
        description: 'Informe de rendimiento',
        hours: null,
        hourlyRateCents: null,
        amountCents: 35000,
      });
    });

    it('rejects a row with neither amount nor hours', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,,,'));

      expect(result.issues[0]).toMatchObject({ line: 2, messageKey: INVOICE_CSV_ERROR.AMOUNT_REQUIRED });
    });
  });

  describe('cell parsing', () => {
    it('splits sub-items on the pipe, trimming and dropping blanks', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,"Endpoint | Bloqueo de solapes |",,2,45,'));

      expect(result.items[0]?.subItems).toEqual(['Endpoint', 'Bloqueo de solapes']);
    });

    it('keeps commas inside quoted fields', () => {
      const result = parseInvoiceCsv(buildCsv('"Reservas, altas y bajas",,,2,45,'));

      expect(result.items[0]?.title).toBe('Reservas, altas y bajas');
    });

    it('reads Spanish headers and comma decimals', () => {
      const csv = 'concepto,subconceptos,descripcion,horas,tarifa,importe\nReservas,,,"12,5","45,00",';
      const result = parseInvoiceCsv(csv);

      expect(result.issues).toEqual([]);
      expect(result.items[0]?.amountCents).toBe(56250);
    });

    it('reads a thousands separator with a comma decimal', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,,,"1.234,56"'));

      expect(result.items[0]?.amountCents).toBe(123456);
    });

    it('reads a lone three-digit group as thousands, not as a decimal', () => {
      // Both locales agree here: "1,234" is 1234 €, never 1,23 €
      const comma = parseInvoiceCsv(buildCsv('Auditoría,,,,,"1,234"'));
      const dot = parseInvoiceCsv(buildCsv('Auditoría,,,,,1.234'));

      expect(comma.items[0]?.amountCents).toBe(123400);
      expect(dot.items[0]?.amountCents).toBe(123400);
    });

    it('still reads a leading zero group as a decimal', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,,,"0,500"'));

      expect(result.items[0]?.amountCents).toBe(50);
    });

    it('rejects an amount that rounds down to zero cents', () => {
      // eurosToCents(0.004) is 0, which requiredPositiveInt would reject with a 400
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,,,0.004'));

      expect(result.items).toEqual([]);
      expect(result.issues[0]).toMatchObject({ messageKey: INVOICE_CSV_ERROR.INVALID_AMOUNT });
    });

    it('rejects hours × rate that round down to zero cents', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,0.001,0.001,'));

      expect(result.items).toEqual([]);
      expect(result.issues[0]).toMatchObject({ messageKey: INVOICE_CSV_ERROR.INVALID_HOURLY_RATE });
    });

    it('strips the currency symbol from amounts', () => {
      const result = parseInvoiceCsv(buildCsv('Auditoría,,,,,350 €'));

      expect(result.items[0]?.amountCents).toBe(35000);
    });

    it('flags non-numeric and negative numbers', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,dos,45,', 'Auditoría,,,,,-10'));

      expect(result.items).toEqual([]);
      expect(result.issues).toMatchObject([
        { line: 2, messageKey: INVOICE_CSV_ERROR.INVALID_HOURS },
        { line: 3, messageKey: INVOICE_CSV_ERROR.INVALID_AMOUNT },
      ]);
    });

    it('rejects zero hours, which no line can be billed for', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,0,45,'));

      expect(result.issues[0]).toMatchObject({ messageKey: INVOICE_CSV_ERROR.INVALID_HOURS });
    });

    it('reads three decimals in the hours column as decimals, not as thousands', () => {
      // Toggl, Clockify and Harvest all export 1,5 h as "1.500"
      const result = parseInvoiceCsv(buildCsv('Reservas,,,1.500,45,'));

      expect(result.issues).toEqual([]);
      expect(result.items[0]?.hours).toBe(1.5);
      expect(result.items[0]?.amountCents).toBe(6750);
    });

    it('keeps an inch mark from swallowing the following rows', () => {
      const result = parseInvoiceCsv(buildCsv('Pantalla 27" 4K,,,,,100', 'Auditoría,,,,,200'));

      expect(result.issues).toEqual([]);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.title).toBe('Pantalla 27" 4K');
    });
  });

  describe('file-level validation', () => {
    it('reports an empty file', () => {
      const result = parseInvoiceCsv('');

      expect(result.issues).toEqual([{ line: 0, messageKey: INVOICE_CSV_ERROR.EMPTY_FILE }]);
    });

    it('reports a header without title or description', () => {
      const result = parseInvoiceCsv('hours,hourlyRate,amount\n2,45,');

      expect(result.items).toEqual([]);
      expect(result.issues).toEqual([{ line: 1, messageKey: INVOICE_CSV_ERROR.MISSING_COLUMNS }]);
    });

    it('reports a header with no data rows', () => {
      const result = parseInvoiceCsv(HEADER);

      expect(result.issues).toEqual([{ line: 0, messageKey: INVOICE_CSV_ERROR.NO_ROWS }]);
    });

    it('skips blank rows without reporting them', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,,,100', ',,,,,', 'Auditoría,,,,,200'));

      expect(result.issues).toEqual([]);
      expect(result.items).toHaveLength(2);
    });

    it('keeps the valid rows when a later one is invalid', () => {
      const result = parseInvoiceCsv(buildCsv('Reservas,,,,,100', ',,,,,200'));

      expect(result.items).toHaveLength(1);
      expect(result.issues).toMatchObject([{ line: 3, messageKey: INVOICE_CSV_ERROR.TITLE_REQUIRED }]);
    });

    it('truncates to the slots the caller still has free', () => {
      const rows = Array.from({ length: 5 }, (_, index) => `Concepto ${index},,,,,100`);
      const result = parseInvoiceCsv(buildCsv(...rows), { maxItems: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.issues).toEqual([{ line: 0, messageKey: INVOICE_CSV_ERROR.TOO_MANY_ROWS, params: { max: 3 } }]);
    });
  });

  describe('line-item limits', () => {
    it('rejects a title longer than the schema allows', () => {
      const longTitle = 'a'.repeat(INVOICE_LINE_ITEM_LIMIT.TITLE_LENGTH + 1);
      const result = parseInvoiceCsv(buildCsv(`${longTitle},,,,,100`));

      expect(result.issues[0]).toMatchObject({
        messageKey: INVOICE_CSV_ERROR.TITLE_TOO_LONG,
        params: { max: INVOICE_LINE_ITEM_LIMIT.TITLE_LENGTH },
      });
    });

    it('rejects more sub-items than the schema allows', () => {
      const subItems = Array.from({ length: INVOICE_LINE_ITEM_LIMIT.MAX_SUB_ITEMS + 1 }, (_, i) => `s${i}`).join('|');
      const result = parseInvoiceCsv(buildCsv(`Reservas,"${subItems}",,,,100`));

      expect(result.issues[0]).toMatchObject({ messageKey: INVOICE_CSV_ERROR.TOO_MANY_SUB_ITEMS });
    });

    it('rejects a description longer than the schema allows', () => {
      const longText = 'a'.repeat(INVOICE_LINE_ITEM_LIMIT.DESCRIPTION_LENGTH + 1);
      const result = parseInvoiceCsv(buildCsv(`Reservas,,${longText},,,100`));

      expect(result.issues[0]).toMatchObject({ messageKey: INVOICE_CSV_ERROR.DESCRIPTION_TOO_LONG });
    });
  });
});
