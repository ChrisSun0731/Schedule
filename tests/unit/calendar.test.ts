import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  buildShiftEvents,
  foldLine,
  googleEventBody,
  googleEventId,
  shiftWindow,
} from '@/services/calendarExport';
import { calendarLink, renderSwapResultEmail } from '@/services/emailTemplates';
import type { ShiftCode, SwapRequest } from '@/types/schedule';
import { DEFAULT_RULES } from '@/utils/scheduler';

const row: ShiftCode[] = ['D', 'E', 'N', 'OFF', 'AL', 'REQ', 'D'];
const schedule = {
  id: 'w1_2026-12-07',
  startDate: '2026-12-07',
  endDate: '2027-01-03',
  assignments: { 'a@x.com': row },
};
const events = buildShiftEvents({
  schedule,
  nurseId: 'a@x.com',
  shiftTimes: DEFAULT_RULES.shiftTimes,
  wardName: '5A 病房',
  portalUrl: 'https://example.github.io/Schedule/#/schedule',
});

describe('calendar events', () => {
  it('adds work shifts as timed events and leave as all-day events, skipping rest days', () => {
    expect(events.map((e) => [e.date, e.code, e.allDay])).toEqual([
      ['2026-12-07', 'D', false],
      ['2026-12-08', 'E', false],
      ['2026-12-09', 'N', false],
      ['2026-12-11', 'AL', true],
      ['2026-12-13', 'D', false],
    ]);
    expect(events[0]).toMatchObject({ start: '2026-12-07T08:00:00', end: '2026-12-07T16:00:00' });
    // E ends at "24:00" → midnight of the next day.
    expect(events[1]).toMatchObject({ start: '2026-12-08T16:00:00', end: '2026-12-09T00:00:00' });
    // N (00:00–08:00) is worked in the early hours of its own date.
    expect(events[2]).toMatchObject({ start: '2026-12-09T00:00:00', end: '2026-12-09T08:00:00' });
    expect(events[3]).toMatchObject({ start: '2026-12-11', end: '2026-12-12' });
    expect(events[0]!.summary).toContain('白班');
    expect(events[0]!.description).toContain('https://example.github.io/Schedule/#/schedule');
  });

  it('ends a shift on the next day when its end is not after its start', () => {
    expect(shiftWindow('2026-12-31', { start: '23:00', end: '07:00' })).toEqual(['2026-12-31T23:00:00', '2027-01-01T07:00:00']);
    expect(shiftWindow('2026-12-31', { start: '08:00', end: '08:00' })).toEqual(['2026-12-31T08:00:00', '2027-01-01T08:00:00']);
  });

  it('uses deterministic base32hex ids that differ per schedule and day', () => {
    const id = googleEventId('w1_2026-12-07', 3);
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleEventId('w1_2026-12-07', 3)).toBe(id);
    expect(googleEventId('w1_2026-12-07', 4)).not.toBe(id);
    expect(googleEventId('w2_2026-12-07', 3)).not.toBe(id);
    // Day 1 of one schedule never collides with day 11 of another.
    expect(googleEventId('a', 11)).not.toBe(googleEventId('a1', 1));
  });

  it('builds Google event bodies tagged with the schedule id', () => {
    const timed = googleEventBody(events[0]!, schedule.id, 'https://example.github.io/Schedule/#/schedule');
    expect(timed.start).toEqual({ dateTime: '2026-12-07T08:00:00', timeZone: 'Asia/Taipei' });
    expect(timed.extendedProperties.private.nursingScheduleId).toBe(schedule.id);
    expect(timed.source?.url).toBe('https://example.github.io/Schedule/#/schedule');
    const allDay = googleEventBody(events[3]!, schedule.id);
    expect(allDay.start).toEqual({ date: '2026-12-11' });
    expect(allDay.transparency).toBe('transparent');
    expect(allDay.source).toBeUndefined();
  });
});

describe('iCalendar export', () => {
  const ics = buildIcs(events, { calendarName: '5A 病房班表, 12 月', now: Date.UTC(2026, 10, 22) });

  it('writes one VEVENT per event with time zone and escaped text', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(events.length);
    expect(ics).toContain('DTSTART;TZID=Asia/Taipei:20261207T080000');
    expect(ics).toContain('DTEND;TZID=Asia/Taipei:20261209T000000');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261211');
    expect(ics).toContain('X-WR-CALNAME:5A 病房班表\\, 12 月');
    expect(ics).toContain('DTSTAMP:20261122T000000Z');
  });

  it('folds long lines at 75 octets without splitting UTF-8 characters', () => {
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const long = `DESCRIPTION:${'護理排班'.repeat(20)}`;
    const folded = foldLine(long);
    expect(folded).toContain('\r\n ');
    expect(folded.replaceAll('\r\n ', '')).toBe(long);
  });
});

describe('calendar links in e-mails', () => {
  it('encodes the schedule id in the portal link', () => {
    expect(calendarLink('https://x.io/app/#/old', 'w 1/2026-12-07')).toBe('https://x.io/app/#/calendar?schedule=w%201%2F2026-12-07');
  });

  it('offers a calendar update only when a swap is approved', () => {
    const swap = {
      id: 's1',
      scheduleId: 'w1_2026-12-07',
      requesterName: 'A',
      targetName: 'B',
      requesterDay: 0,
      targetDay: 0,
      requesterDate: '2026-12-07',
      targetDate: '2026-12-07',
      warnings: [],
    } as unknown as SwapRequest;
    const base = { wardName: 'W', swap, recipientName: 'A', portalUrl: 'https://x/' };
    const cells = { requester: ['D', 'D'], target: ['N', 'N'] } satisfies Parameters<typeof renderSwapResultEmail>[0]['cells'];
    const approved = renderSwapResultEmail({ ...base, cells, status: 'approved' });
    expect(approved.html).toContain('#/calendar?schedule=w1_2026-12-07');
    expect(approved.text).toContain('更新 Google 日曆');
    const rejected = renderSwapResultEmail({ ...base, cells, status: 'rejected' });
    expect(rejected.html).not.toContain('#/calendar');
  });
});
