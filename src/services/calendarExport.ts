/**
 * Turns one nurse's row of a schedule into calendar events (Google Calendar API bodies and
 * an iCalendar file). Pure – no Firebase or DOM access – so it is unit tested.
 *
 * - Work shifts (D / E / N) become timed events using the hospital's shift times; an end at
 *   or before the start (or "24:00") ends on the next day.
 * - Leave that replaces a working day (AL, OL, SL …) becomes an all-day "free" event.
 * - Rest days (OFF, REQ) are left out.
 *
 * Every event has a deterministic id derived from (schedule, day), so syncing the same
 * schedule again updates the events instead of adding duplicates.
 */
import { SHIFT_META } from '@/constants/labels';
import { isLeaveDay, isWorkShift, type Schedule, type ShiftCode, type ShiftTime, type WorkShift } from '@/types/schedule';
import { addDays, formatPeriod } from '@/utils/dates';

/** Shift times are wall-clock times at the hospital. Taiwan has no DST, so a fixed offset is exact. */
export const SCHEDULE_TIME_ZONE = { id: 'Asia/Taipei', offset: '+0800', name: 'CST' } as const;

/** Private extended property that tags our events in the user's Google Calendar. */
export const GOOGLE_SCHEDULE_PROPERTY = 'nursingScheduleId';

/** Google Calendar colour ids closest to SHIFT_META (5 banana, 6 tangerine, 9 blueberry, 10 basil). */
const GOOGLE_COLOR: Record<WorkShift | 'leave', string> = { D: '5', E: '6', N: '9', leave: '10' };

export interface ShiftEvent {
  /** Google event id (base32hex) – also the iCalendar UID prefix. */
  id: string;
  day: number;
  date: string;
  code: ShiftCode;
  summary: string;
  description: string;
  allDay: boolean;
  /** Timed: local "YYYY-MM-DDTHH:mm:00" in SCHEDULE_TIME_ZONE. All-day: "YYYY-MM-DD". */
  start: string;
  /** Timed: local date-time. All-day: the day after (exclusive end). */
  end: string;
}

export interface BuildEventsInput {
  schedule: Pick<Schedule, 'id' | 'startDate' | 'endDate' | 'assignments'>;
  nurseId: string;
  shiftTimes: Record<WorkShift, ShiftTime>;
  wardName: string;
  /** Link back to the portal, added to each event's description. */
  portalUrl?: string;
}

function toHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Google event ids may only use base32hex characters (a–v, 0–9). Hex is a subset, and "v"
 * never occurs in hex, so it safely separates the schedule part from the day.
 */
export function googleEventId(scheduleId: string, day: number): string {
  return `nsched${toHex(scheduleId)}v${String(day).padStart(2, '0')}`;
}

function minutesOf(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function localDateTime(date: string, minutes: number): string {
  const dayShift = Math.floor(minutes / 1440);
  const rest = minutes - dayShift * 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, '0');
  const mm = String(rest % 60).padStart(2, '0');
  return `${addDays(date, dayShift)}T${hh}:${mm}:00`;
}

/** [start, end] local date-times of a shift worked on `date` (same rule as the scheduler's rest check). */
export function shiftWindow(date: string, time: ShiftTime): [string, string] {
  const start = minutesOf(time.start);
  let end = minutesOf(time.end);
  if (end <= start) end += 1440;
  return [localDateTime(date, start), localDateTime(date, end)];
}

export function buildShiftEvents(input: BuildEventsInput): ShiftEvent[] {
  const { schedule, nurseId, shiftTimes, wardName, portalUrl } = input;
  const row = schedule.assignments[nurseId] ?? [];
  const period = formatPeriod(schedule.startDate, schedule.endDate);
  const description = [`${wardName} ${period} 班表`, '由護理排班系統加入，班表異動時請重新同步。', portalUrl ?? '']
    .filter(Boolean)
    .join('\n');
  const out: ShiftEvent[] = [];
  row.forEach((code, day) => {
    const date = addDays(schedule.startDate, day);
    const meta = SHIFT_META[code];
    const base = { id: googleEventId(schedule.id, day), day, date, code, description };
    if (isWorkShift(code)) {
      const time = shiftTimes[code];
      const [start, end] = shiftWindow(date, time);
      out.push({ ...base, summary: `${meta.label}（${code}）${time.start}–${time.end} · ${wardName}`, allDay: false, start, end });
    } else if (isLeaveDay(code)) {
      out.push({ ...base, summary: `${meta.label}（${code}）· ${wardName}`, allDay: true, start: date, end: addDays(date, 1) });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Google Calendar API
// ---------------------------------------------------------------------------

export interface GoogleEventBody {
  id: string;
  summary: string;
  description: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  colorId: string;
  transparency: 'opaque' | 'transparent';
  status: 'confirmed';
  extendedProperties: { private: Record<string, string> };
  source?: { title: string; url: string };
}

export function googleEventBody(event: ShiftEvent, scheduleId: string, portalUrl?: string): GoogleEventBody {
  const when = (value: string) => (event.allDay ? { date: value } : { dateTime: value, timeZone: SCHEDULE_TIME_ZONE.id });
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: when(event.start),
    end: when(event.end),
    colorId: isWorkShift(event.code) ? GOOGLE_COLOR[event.code] : GOOGLE_COLOR.leave,
    transparency: event.allDay ? 'transparent' : 'opaque',
    // Also revives an event the user deleted earlier (its id stays reserved by Google).
    status: 'confirmed',
    extendedProperties: { private: { [GOOGLE_SCHEDULE_PROPERTY]: scheduleId, nursingDay: String(event.day) } },
    ...(portalUrl && /^https?:\/\//.test(portalUrl) ? { source: { title: '護理排班系統', url: portalUrl } } : {}),
  };
}

/** Opens Google Calendar's week view at `date`. */
export function googleCalendarWeekUrl(date: string): string {
  return `https://calendar.google.com/calendar/r/week/${date.replaceAll('-', '/')}`;
}

// ---------------------------------------------------------------------------
// iCalendar (RFC 5545)
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Fold to ≤ 75 octets per line without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function compact(localDateTimeOrDate: string): string {
  return localDateTimeOrDate.replace(/[-:]/g, '');
}

function utcStamp(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export function buildIcs(events: ShiftEvent[], opts: { calendarName: string; now?: number }): string {
  const tz = SCHEDULE_TIME_ZONE;
  const stamp = utcStamp(opts.now ?? Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nursing Shift Scheduler//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    `X-WR-TIMEZONE:${tz.id}`,
    'BEGIN:VTIMEZONE',
    `TZID:${tz.id}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${tz.offset}`,
    `TZOFFSETTO:${tz.offset}`,
    `TZNAME:${tz.name}`,
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@nursing-shift-scheduler`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${compact(e.end)}`, 'TRANSP:TRANSPARENT');
    } else {
      lines.push(`DTSTART;TZID=${tz.id}:${compact(e.start)}`, `DTEND;TZID=${tz.id}:${compact(e.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.summary)}`, `DESCRIPTION:${escapeText(e.description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
