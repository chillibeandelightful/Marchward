import { CALENDAR, SEASON_NAME, type Season } from '../data/economy';

export interface GameDate {
  /** Starts at 1. */
  year: number;
  /** 0-based index into CALENDAR.months (0 is the first month of spring). */
  month: number;
  /** Starts at 1. */
  day: number;
  season: Season;
}

const DAYS_PER_YEAR = CALENDAR.daysPerMonth * CALENDAR.months.length;

/** The date of a day number (day 0 is the first day of spring, year 1). */
export function dateOf(dayNumber: number): GameDate {
  const year = Math.floor(dayNumber / DAYS_PER_YEAR) + 1;
  const inYear = dayNumber - (year - 1) * DAYS_PER_YEAR;
  const month = Math.floor(inYear / CALENDAR.daysPerMonth);
  return { year, month, day: inYear - month * CALENDAR.daysPerMonth + 1, season: CALENDAR.seasons[month] as Season };
}

export function dayOfTick(tick: number): number {
  return Math.floor(tick / CALENDAR.ticksPerDay);
}

export function isWinter(dayNumber: number): boolean {
  return dateOf(dayNumber).season === 'winter';
}

export function formatDate(dayNumber: number): string {
  const d = dateOf(dayNumber);
  return `${d.day} ${CALENDAR.months[d.month]}, year ${d.year}`;
}

export function formatMonth(dayNumber: number): string {
  const d = dateOf(dayNumber);
  return `${CALENDAR.months[d.month]}, year ${d.year}`;
}

export function seasonName(dayNumber: number): string {
  return SEASON_NAME[dateOf(dayNumber).season];
}

/** The day number reached after `workDays` more working days from `from`, skipping winters. */
export function addWorkingDays(from: number, workDays: number): number {
  let day = from;
  let left = Math.ceil(workDays);
  while (left > 0) {
    if (isWinter(day)) {
      day++;
      continue;
    }
    left--;
    day++;
  }
  return day;
}
