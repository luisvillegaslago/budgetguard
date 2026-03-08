/**
 * Unit Tests: Skydive CSV Parsers
 * Tests parseJumpRow() and parseTunnelRow() for CSV import parsing
 */

import { parseJumpRow, parseTunnelRow } from '@/utils/skydiveParsers';

// ---------------------------------------------------------------------------
// parseJumpRow
// ---------------------------------------------------------------------------

describe('parseJumpRow', () => {
  describe('valid rows', () => {
    it('should parse a row with all fields populated', () => {
      const raw: Record<string, string> = {
        'Jump Number': '42',
        Date: '15/03/2024',
        Title: 'Belly 4-way',
        Dropzone: 'Skydive Spain',
        Canopy: 'Sabre3 170',
        Wingsuit: '',
        'Freefall Time': '55',
        'Jump Type': 'Belly',
        Aircraft: 'Dornier G92',
        'Exit Altitude': '15000',
        Comment: 'Great jump!',
      };

      const result = parseJumpRow(raw);

      expect(result).toEqual({
        jumpNumber: 42,
        title: 'Belly 4-way',
        jumpDate: '2024-03-15',
        dropzone: 'Skydive Spain',
        canopy: 'Sabre3 170',
        wingsuit: null,
        freefallTimeSec: 55,
        jumpType: 'Belly',
        aircraft: 'Dornier G92',
        exitAltitudeFt: 15000,
        landingDistanceM: null,
        comment: 'Great jump!',
      });
    });

    it('should parse a row with only required fields (jump number and date)', () => {
      const raw: Record<string, string> = {
        'Jump Number': '1',
        Date: '01/06/2023',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpNumber).toBe(1);
      expect(result?.jumpDate).toBe('2023-06-01');
      expect(result?.freefallTimeSec).toBeNull();
      expect(result?.exitAltitudeFt).toBeNull();
      expect(result?.title).toBeNull();
      expect(result?.dropzone).toBeNull();
      expect(result?.canopy).toBeNull();
      expect(result?.wingsuit).toBeNull();
      expect(result?.aircraft).toBeNull();
      expect(result?.comment).toBeNull();
      expect(result?.landingDistanceM).toBeNull();
    });
  });

  describe('date parsing', () => {
    it('should parse D/M/YY format with 2-digit year <= 50 as 20xx', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '5/3/23',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('2023-03-05');
    });

    it('should parse D/M/YY format with 2-digit year > 50 as 19xx', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '1/5/95',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('1995-05-01');
    });

    it('should parse DD/MM/YYYY format with 4-digit year', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '25/12/2024',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('2024-12-25');
    });

    it('should treat year "50" as 2050 (boundary case)', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '1/1/50',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('2050-01-01');
    });

    it('should treat year "51" as 1951 (boundary case)', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '1/1/51',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('1951-01-01');
    });
  });

  describe('altitude parsing', () => {
    it('should strip non-digit characters from altitude (e.g., "15000 ft")', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Exit Altitude': '15000 ft',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.exitAltitudeFt).toBe(15000);
    });

    it('should handle altitude with commas (e.g., "15,000")', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Exit Altitude': '15,000',
      };

      const result = parseJumpRow(raw);

      expect(result?.exitAltitudeFt).toBe(15000);
    });

    it('should return null altitude when field is empty', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Exit Altitude': '',
      };

      const result = parseJumpRow(raw);

      expect(result?.exitAltitudeFt).toBeNull();
    });
  });

  describe('alternate column names', () => {
    it('should accept "JumpNumber" instead of "Jump Number"', () => {
      const raw: Record<string, string> = {
        JumpNumber: '5',
        Date: '01/01/2024',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpNumber).toBe(5);
    });

    it('should accept "#" as jump number column', () => {
      const raw: Record<string, string> = {
        '#': '7',
        Date: '01/01/2024',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpNumber).toBe(7);
    });

    it('should accept "JumpDate" instead of "Date"', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        JumpDate: '15/06/2024',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.jumpDate).toBe('2024-06-15');
    });

    it('should accept "FreefallTime" instead of "Freefall Time"', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        FreefallTime: '60',
      };

      const result = parseJumpRow(raw);

      expect(result?.freefallTimeSec).toBe(60);
    });

    it('should accept "ExitAltitude" instead of "Exit Altitude"', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        ExitAltitude: '14000',
      };

      const result = parseJumpRow(raw);

      expect(result?.exitAltitudeFt).toBe(14000);
    });

    it('should accept "DZ" as dropzone column', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        DZ: 'Empuriabrava',
      };

      const result = parseJumpRow(raw);

      expect(result?.dropzone).toBe('Empuriabrava');
    });

    it('should accept "Plane" as aircraft column', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        Plane: 'CASA 212',
      };

      const result = parseJumpRow(raw);

      expect(result?.aircraft).toBe('CASA 212');
    });

    it('should accept "Type" and "JumpType" as jump type columns', () => {
      const rawType: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        Type: 'AFF',
      };
      const rawJumpType: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        JumpType: 'Freefly',
      };

      expect(parseJumpRow(rawType)?.jumpType).toBe('AFF');
      expect(parseJumpRow(rawJumpType)?.jumpType).toBe('Freefly');
    });

    it('should accept "Notes" as comment column', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        Notes: 'Practice pull',
      };

      const result = parseJumpRow(raw);

      expect(result?.comment).toBe('Practice pull');
    });
  });

  describe('invalid rows — returns null', () => {
    it('should return null when jump number is missing', () => {
      const raw: Record<string, string> = {
        Date: '01/01/2024',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });

    it('should return null when jump number is NaN', () => {
      const raw: Record<string, string> = {
        'Jump Number': 'abc',
        Date: '01/01/2024',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });

    it('should return null when jump number is zero', () => {
      const raw: Record<string, string> = {
        'Jump Number': '0',
        Date: '01/01/2024',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });

    it('should return null when date is missing', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });

    it('should return null when date has wrong format (not D/M/Y)', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '2024-01-01',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });

    it('should return null when date is empty string', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '',
      };

      expect(parseJumpRow(raw)).toBeNull();
    });
  });

  describe('freefall time edge cases', () => {
    it('should return null freefall time when value is non-numeric', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Freefall Time': 'N/A',
      };

      const result = parseJumpRow(raw);

      expect(result).not.toBeNull();
      expect(result?.freefallTimeSec).toBeNull();
    });

    it('should return null freefall time when field is empty', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Freefall Time': '',
      };

      const result = parseJumpRow(raw);

      expect(result?.freefallTimeSec).toBeNull();
    });

    it('should parse freefall time of 0 as 0', () => {
      const raw: Record<string, string> = {
        'Jump Number': '10',
        Date: '01/01/2024',
        'Freefall Time': '0',
      };

      const result = parseJumpRow(raw);

      expect(result?.freefallTimeSec).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// parseTunnelRow
// ---------------------------------------------------------------------------

describe('parseTunnelRow', () => {
  describe('valid rows', () => {
    it('should parse a row with H:MM duration format', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Lugar: 'Madrid Fly',
        Tipo: 'Belly',
        Tiempo: '0:30',
        Notas: 'Great session',
      };

      const result = parseTunnelRow(raw);

      expect(result).toEqual({
        sessionDate: '2024-03-10',
        location: 'Madrid Fly',
        sessionType: 'Belly',
        durationSec: 1800,
        priceCents: null,
        notes: 'Great session',
      });
    });

    it('should parse a row with plain number as minutes', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '15',
      };

      const result = parseTunnelRow(raw);

      expect(result).not.toBeNull();
      expect(result?.durationSec).toBe(900);
    });

    it('should parse H:MM with hours and minutes (e.g., "1:30" = 90 min)', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '1:30',
      };

      const result = parseTunnelRow(raw);

      expect(result?.durationSec).toBe(5400);
    });

    it('should parse larger H:MM values (e.g., "10:00" = 10 hours)', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '10:00',
      };

      const result = parseTunnelRow(raw);

      expect(result?.durationSec).toBe(36000);
    });
  });

  describe('date parsing', () => {
    it('should parse DD/MM/YYYY format', () => {
      const raw: Record<string, string> = {
        Fecha: '25/12/2024',
        Tiempo: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result).not.toBeNull();
      expect(result?.sessionDate).toBe('2024-12-25');
    });

    it('should parse D/M/YY with 2-digit year <= 50 as 20xx', () => {
      const raw: Record<string, string> = {
        Fecha: '5/3/23',
        Tiempo: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result?.sessionDate).toBe('2023-03-05');
    });

    it('should parse D/M/YY with 2-digit year > 50 as 19xx', () => {
      const raw: Record<string, string> = {
        Fecha: '1/5/95',
        Tiempo: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result?.sessionDate).toBe('1995-05-01');
    });
  });

  describe('alternate column names', () => {
    it('should accept "Date" instead of "Fecha"', () => {
      const raw: Record<string, string> = {
        Date: '10/03/2024',
        Duration: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result).not.toBeNull();
      expect(result?.sessionDate).toBe('2024-03-10');
    });

    it('should accept "SessionDate" as date column', () => {
      const raw: Record<string, string> = {
        SessionDate: '10/03/2024',
        Duration: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result).not.toBeNull();
      expect(result?.sessionDate).toBe('2024-03-10');
    });

    it('should accept "Duration" instead of "Tiempo"', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Duration: '120',
      };

      const result = parseTunnelRow(raw);

      expect(result?.durationSec).toBe(7200);
    });

    it('should accept "DurationSec" as duration column', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        DurationSec: '15',
      };

      const result = parseTunnelRow(raw);

      expect(result?.durationSec).toBe(900);
    });

    it('should accept "Location" instead of "Lugar"', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '60',
        Location: 'iFLY Barcelona',
      };

      const result = parseTunnelRow(raw);

      expect(result?.location).toBe('iFLY Barcelona');
    });

    it('should accept "Type" and "SessionType" instead of "Tipo"', () => {
      const rawType: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '60',
        Type: 'Freefly',
      };
      const rawSessionType: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '60',
        SessionType: 'Dynamic',
      };

      expect(parseTunnelRow(rawType)?.sessionType).toBe('Freefly');
      expect(parseTunnelRow(rawSessionType)?.sessionType).toBe('Dynamic');
    });

    it('should accept "Notes" instead of "Notas"', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '60',
        Notes: 'Coached session',
      };

      const result = parseTunnelRow(raw);

      expect(result?.notes).toBe('Coached session');
    });
  });

  describe('invalid rows — returns null', () => {
    it('should return null when date is missing', () => {
      const raw: Record<string, string> = {
        Tiempo: '60',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when date is empty', () => {
      const raw: Record<string, string> = {
        Fecha: '',
        Tiempo: '60',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when date has wrong format', () => {
      const raw: Record<string, string> = {
        Fecha: '2024-03-10',
        Tiempo: '60',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when duration is missing', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when duration is zero', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '0',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when duration is NaN', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: 'abc',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });

    it('should return null when duration is empty string', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '',
      };

      expect(parseTunnelRow(raw)).toBeNull();
    });
  });

  describe('optional fields default to null', () => {
    it('should return null for location, sessionType, and notes when not provided', () => {
      const raw: Record<string, string> = {
        Fecha: '10/03/2024',
        Tiempo: '60',
      };

      const result = parseTunnelRow(raw);

      expect(result).not.toBeNull();
      expect(result?.location).toBeNull();
      expect(result?.sessionType).toBeNull();
      expect(result?.notes).toBeNull();
    });
  });
});
