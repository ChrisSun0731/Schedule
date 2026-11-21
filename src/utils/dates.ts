/**
 * Calendar helpers. Dates are plain `YYYY-MM-DD` strings handled in UTC so that the
 * user's time zone can never shift a schedule day.
 */
import { WEEKDAY_LABELS } from '@/constants/labels';
import { PERIOD_DAYS, WEEK_DAYS, type DayInfo } from '@/types/schedule';

const DAY_MS = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round((parseISODate(toIso).getTime() - parseISODate(fromIso).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** Today in the browser's local calendar. */
export function todayISO(): string {
  const now = new Date();
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** The next Monday strictly after `iso` (or `iso` itself when it is a Monday and `inclusive`). */
export function nextMonday(iso: string = todayISO(), inclusive = false): string {
  const dow = dayOfWeek(iso);
  if (inclusive && dow === 1) return iso;
  const delta = (8 - dow) % 7 || 7;
  return addDays(iso, delta);
}

export function periodEnd(startIso: string): string {
  return addDays(startIso, PERIOD_DAYS - 1);
}

export function weekdayLabel(iso: string): string {
  return WEEKDAY_LABELS[dayOfWeek(iso)] ?? '';
}

/** 12/07 */
export function formatMD(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/** 2026/12/07 */
export function formatYMD(iso: string): string {
  return iso.replaceAll('-', '/');
}

/** 12/07（一） */
export function formatMDW(iso: string): string {
  return `${formatMD(iso)}（${weekdayLabel(iso)}）`;
}

export function formatPeriod(startIso: string, endIso: string = periodEnd(startIso)): string {
  return `${formatYMD(startIso)} – ${formatYMD(endIso)}`;
}

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function isWeekendDow(dow: number): boolean {
  return dow === 0 || dow === 6;
}

/** Build the 28 day descriptors of a period. */
export function buildDays(startIso: string, holidayIndexes: number[] = [], length = PERIOD_DAYS): DayInfo[] {
  const holidays = new Set(holidayIndexes);
  return Array.from({ length }, (_, index) => {
    const date = addDays(startIso, index);
    const dow = dayOfWeek(date);
    return {
      index,
      date,
      dow,
      week: Math.floor(index / WEEK_DAYS),
      isWeekend: isWeekendDow(dow),
      isHoliday: holidays.has(index),
    };
  });
}

/** Day indexes (0..27) of `isoDates` that fall inside the period starting at `startIso`. */
export function holidayIndexesFor(startIso: string, isoDates: string[]): number[] {
  return isoDates
    .map((iso) => diffDays(startIso, iso))
    .filter((i) => i >= 0 && i < PERIOD_DAYS)
    .sort((a, b) => a - b);
}

/** Inclusive list of ISO dates from `startIso` to `endIso`. */
export function eachDate(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const n = diffDays(startIso, endIso);
  for (let i = 0; i <= n; i++) out.push(addDays(startIso, i));
  return out;
}
