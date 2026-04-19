/**
 * Unit tests for fiscal filename parser.
 * Tests auto-detection of document metadata from filenames.
 */

import { FISCAL_DOCUMENT_TYPE, FISCAL_STATUS, MODELO_TYPE } from '@/constants/finance';
import { buildModeloFileName, parseDocumentFilename } from '@/utils/fiscalFileParser';

describe('parseDocumentFilename', () => {
  describe('quarterly modelo patterns', () => {
    it('should parse "303 1T 2024.pdf"', () => {
      const result = parseDocumentFilename('303 1T 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M303);
      expect(result.fiscalYear).toBe(2024);
      expect(result.fiscalQuarter).toBe(1);
      expect(result.status).toBe(FISCAL_STATUS.FILED);
    });

    it('should parse "130 3T 2025.pdf"', () => {
      const result = parseDocumentFilename('130 3T 2025.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M130);
      expect(result.fiscalYear).toBe(2025);
      expect(result.fiscalQuarter).toBe(3);
      expect(result.status).toBe(FISCAL_STATUS.FILED);
    });

    it('should parse "modelo 303 Q2 2024.pdf" (with "modelo" prefix)', () => {
      const result = parseDocumentFilename('modelo 303 Q2 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M303);
      expect(result.fiscalQuarter).toBe(2);
      expect(result.fiscalYear).toBe(2024);
    });

    it('should parse "303 4t 2023.pdf" (lowercase t)', () => {
      const result = parseDocumentFilename('303 4t 2023.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M303);
      expect(result.fiscalQuarter).toBe(4);
      expect(result.fiscalYear).toBe(2023);
    });
  });

  describe('annual modelo patterns', () => {
    it('should parse "390 2024.pdf"', () => {
      const result = parseDocumentFilename('390 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M390);
      expect(result.fiscalYear).toBe(2024);
      expect(result.fiscalQuarter).toBeNull();
    });

    it('should parse "100 2024.pdf"', () => {
      const result = parseDocumentFilename('100 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M100);
      expect(result.fiscalYear).toBe(2024);
      expect(result.fiscalQuarter).toBeNull();
    });
  });

  describe('aplazamiento files parsed as filed', () => {
    it('should parse "aplazamiento 303 1T 2024.pdf" as filed modelo', () => {
      const result = parseDocumentFilename('aplazamiento 303 1T 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.modeloType).toBe(MODELO_TYPE.M303);
      expect(result.status).toBe(FISCAL_STATUS.FILED);
    });
  });

  describe('factura recibida (non-modelo) patterns', () => {
    it('should parse "vodafone enero 2024.pdf" as factura recibida', () => {
      const result = parseDocumentFilename('vodafone enero 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);
      expect(result.modeloType).toBeNull();
      expect(result.fiscalYear).toBe(2024);
      expect(result.status).toBe(FISCAL_STATUS.PENDING);
      expect(result.description).toBe('vodafone enero 2024');
    });

    it('should parse "naturgy Q1 2025.pdf" as factura with quarter', () => {
      const result = parseDocumentFilename('naturgy Q1 2025.pdf');

      // Not a modelo pattern, so it's a factura
      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);
      expect(result.fiscalYear).toBe(2025);
    });

    it('should handle files without year', () => {
      const result = parseDocumentFilename('random-document.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);
      expect(result.modeloType).toBeNull();
      expect(result.fiscalYear).toBeNull();
      expect(result.description).toBe('random-document');
    });
  });

  describe('edge cases', () => {
    it('should strip file extension before parsing', () => {
      const result = parseDocumentFilename('303 1T 2024.PDF');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
      expect(result.fiscalYear).toBe(2024);
    });

    it('should handle multiple extensions', () => {
      const result = parseDocumentFilename('303 1T 2024.scan.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.MODELO);
    });

    it('should not match invalid modelo numbers', () => {
      const result = parseDocumentFilename('999 1T 2024.pdf');

      expect(result.documentType).toBe(FISCAL_DOCUMENT_TYPE.FACTURA_RECIBIDA);
    });
  });
});

describe('buildModeloFileName', () => {
  it('builds quarterly modelo name with Spanish convention', () => {
    expect(buildModeloFileName(MODELO_TYPE.M130, 1, 2026, 'CotejoDocIdSv.pdf')).toBe('130 1T 2026.pdf');
  });

  it('preserves uppercase extension', () => {
    expect(buildModeloFileName(MODELO_TYPE.M303, 4, 2025, 'archivo.PDF')).toBe('303 4T 2025.PDF');
  });

  it('builds annual modelo name without quarter (390)', () => {
    expect(buildModeloFileName(MODELO_TYPE.M390, null, 2024, 'foo.pdf')).toBe('390 2024.pdf');
  });

  it('builds annual modelo name without quarter (100)', () => {
    expect(buildModeloFileName(MODELO_TYPE.M100, null, 2024, 'foo.pdf')).toBe('100 2024.pdf');
  });

  it('ignores quarter for annual modelos even if provided', () => {
    expect(buildModeloFileName(MODELO_TYPE.M390, 2, 2024, 'foo.pdf')).toBe('390 2024.pdf');
  });

  it('returns original filename when modeloType is null', () => {
    expect(buildModeloFileName(null, 1, 2026, 'foo.pdf')).toBe('foo.pdf');
  });

  it('returns original filename when fiscalYear is null', () => {
    expect(buildModeloFileName(MODELO_TYPE.M130, 1, null, 'foo.pdf')).toBe('foo.pdf');
  });

  it('returns original filename when quarterly modelo lacks quarter', () => {
    expect(buildModeloFileName(MODELO_TYPE.M130, null, 2026, 'foo.pdf')).toBe('foo.pdf');
  });

  it('handles files without extension', () => {
    expect(buildModeloFileName(MODELO_TYPE.M130, 1, 2026, 'CotejoDocIdSv')).toBe('130 1T 2026');
  });
});
