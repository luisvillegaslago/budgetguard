/**
 * BudgetGuard Working Days
 *
 * A tax deadline that lands on a día inhábil moves to the next working one (art. 30.5 Ley
 * 39/2015), and the AEAT's own calendar says the domiciliación deadline moves with it by the
 * same number of days.
 *
 * DATES ARE LOCAL, like the rest of fiscalDeadlines.ts: a deadline is a calendar day in Spain,
 * and reading it in UTC would move it to the previous day for half the year.
 *
 * SCOPE — weekends, the fixed national holidays and Semana Santa. Regional and municipal ones
 * are deliberately out: they would need a table per comunidad and per year, and the app never
 * uses this to move a reminder later, only to explain that a deadline was extended. Being a day
 * early is free; being a day late is a recargo.
 */

/** Fixed national holidays as [month (1-12), day]. Movable feasts are computed apart. */
const FIXED_NATIONAL_HOLIDAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], // Año Nuevo
  [1, 6], // Epifanía
  [5, 1], // Día del Trabajo
  [8, 15], // Asunción
  [10, 12], // Fiesta Nacional
  [11, 1], // Todos los Santos
  [12, 6], // Constitución
  [12, 8], // Inmaculada
  [12, 25], // Navidad
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Easter Sunday, anonymous Gregorian algorithm. Deterministic and good for any year of the
 * Gregorian calendar, which is what the movable feasts hang from.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Whether a date is a working day for AEAT deadline purposes.
 * Compared by calendar day, never by instant.
 */
export function isWorkingDay(date: Date): boolean {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return false;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (FIXED_NATIONAL_HOLIDAYS.some(([holidayMonth, holidayDay]) => holidayMonth === month && holidayDay === day)) {
    return false;
  }

  // Jueves and Viernes Santo: the only movable feasts that can reach a tax deadline, since
  // Easter runs as late as 25 April and the quarterly deadline is the 20th.
  const easter = easterSunday(date.getFullYear());
  const maundyThursday = new Date(easter.getTime() - 3 * MS_PER_DAY);
  const goodFriday = new Date(easter.getTime() - 2 * MS_PER_DAY);

  return !sameDay(date, maundyThursday) && !sameDay(date, goodFriday);
}

/** The date itself when it is a working day, otherwise the first working day after it. */
export function nextWorkingDay(date: Date): Date {
  const shifted = new Date(date.getTime());
  while (!isWorkingDay(shifted)) {
    shifted.setDate(shifted.getDate() + 1);
  }
  return shifted;
}
