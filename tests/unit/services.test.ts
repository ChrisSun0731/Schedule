import { describe, expect, it, vi } from 'vitest';
import { utils } from 'xlsx';
import { createDemoNurses } from '@/services/demoData';
import { EmailDispatcher, type EmailMessage, type EmailTransport } from '@/services/emailService';
import { renderScheduleEmail, renderSwapRequestEmail, escapeHtml } from '@/services/emailTemplates';
import { buildScheduleWorkbook } from '@/services/excelExport';
import type { NurseSnapshot, Schedule, ShiftCode, SwapRequest } from '@/types/schedule';
import { buildDays } from '@/utils/dates';
import { DEFAULT_RULES, evaluateSchedule } from '@/utils/scheduler';

const msg = (to: string): EmailMessage => ({ to, toName: to, subject: 's', html: 'h', text: 't', type: 'schedule' });

describe('EmailDispatcher', () => {
  it('throttles, retries failures with backoff and reports final status per recipient', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const failures = new Map([['flaky@x.com', 1], ['dead@x.com', 99]]);
    const transport: EmailTransport = {
      id: 'mock',
      async send(m) {
        calls.push(m.to);
        const left = failures.get(m.to) ?? 0;
        if (left > 0) {
          failures.set(m.to, left - 1);
          throw new Error('boom');
        }
      },
    };
    const d = new EmailDispatcher(transport, { sender: { email: 'h@x.com', name: 'H' } }, {
      concurrency: 1,
      minIntervalMs: 100,
      maxAttempts: 3,
      backoffMs: 1000,
    });
    const jobs = d.enqueue([msg('ok@x.com'), msg('flaky@x.com'), msg('dead@x.com')]);
    expect(jobs.map((j) => j.status)).toEqual(['sending', 'queued', 'queued']);

    const done = Promise.all(jobs.map((j) => d.waitFor(j)));
    await vi.runAllTimersAsync();
    await done;

    expect(jobs.map((j) => j.status)).toEqual(['sent', 'sent', 'failed']);
    expect(jobs.map((j) => j.attempts)).toEqual([1, 2, 3]);
    expect(jobs[2]!.error).toBe('boom');
    expect(calls.filter((c) => c === 'dead@x.com')).toHaveLength(3);

    // manual retry of the failed job
    failures.set('dead@x.com', 0);
    d.retryFailed();
    const again = d.waitFor(jobs[2]!);
    await vi.runAllTimersAsync();
    expect((await again).status).toBe('sent');
    vi.useRealTimers();
  });
});

const days = buildDays('2026-12-07');
const nurses: NurseSnapshot[] = createDemoNurses().slice(0, 3).map((u) => ({
  id: u.id,
  name: u.displayName,
  employeeId: u.employeeId,
  level: u.level,
  email: u.email,
  allowedShifts: u.allowedShifts,
}));
const week: ShiftCode[] = ['D', 'D', 'E', 'E', 'N', 'OFF', 'OFF'];
const schedule: Schedule = {
  id: 'w1_2026-12-07',
  wardId: 'w1',
  startDate: '2026-12-07',
  endDate: '2027-01-03',
  status: 'published',
  nurseOrder: nurses.map((n) => n.id),
  nurses: Object.fromEntries(nurses.map((n) => [n.id, n])),
  assignments: Object.fromEntries(nurses.map((n) => [n.id, [...week, ...week, ...week, ...week]])),
  locks: {},
  holidays: [],
  createdAt: 1,
  createdBy: 'h',
  updatedAt: 1,
  updatedBy: 'h',
};

describe('e-mail templates', () => {
  it('renders the personal 28-day schedule with counts and portal link', () => {
    const mail = renderScheduleEmail({
      wardName: '5A 病房',
      nurse: nurses[0]!,
      row: schedule.assignments[nurses[0]!.id]!,
      days,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      portalUrl: 'https://example.github.io/Schedule/',
      scheduleId: schedule.id,
    });
    expect(mail.subject).toBe('【5A 病房】2026/12/07 – 2027/01/03 個人班表');
    expect(mail.html).toContain('https://example.github.io/Schedule/#/swaps');
    expect(mail.html).toContain('https://example.github.io/Schedule/#/calendar?schedule=w1_2026-12-07');
    expect(mail.html).toContain('加入 Google 日曆');
    expect(mail.text).toContain('加入 Google 日曆：https://example.github.io/Schedule/#/calendar?schedule=w1_2026-12-07');
    expect(mail.text).toContain('上班 20 天、休假 8 天');
    expect(mail.text).toContain('12/07（一）  D 白班');
    expect(mail.text.split('\n').filter((l) => /^\d\d\/\d\d（/.test(l))).toHaveLength(28);
  });

  it('escapes user-provided text in swap e-mails', () => {
    const swap = {
      id: 's1',
      requesterName: '<script>',
      requesterEmployeeId: 'RN1',
      targetName: 'B',
      requesterDay: 0,
      targetDay: 0,
      requesterDate: '2026-12-07',
      targetDate: '2026-12-07',
      note: '"hi" & <b>',
    } as SwapRequest;
    const mail = renderSwapRequestEmail({
      wardName: 'W',
      swap,
      cells: { requester: ['D', 'D'], target: ['N', 'N'] },
      portalUrl: 'https://x/',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(escapeHtml('"hi" & <b>'));
    expect(mail.html).toContain('#/swaps?id=s1');
  });
});

describe('Excel export', () => {
  it('builds staff rows, totals and headcount summary rows', () => {
    const evaluation = evaluateSchedule({
      days,
      nurses: nurses.map((n) => ({ id: n.id, name: n.name, level: n.level, allowedShifts: n.allowedShifts })),
      rules: DEFAULT_RULES,
      assignments: schedule.assignments,
    });
    const wb = buildScheduleWorkbook({ wardName: '5A', schedule, days, nurses, evaluation });
    expect(wb.SheetNames).toEqual(['班表', '規則檢查', '圖例']);
    const rows = utils.sheet_to_json<(string | number)[]>(wb.Sheets['班表']!, { header: 1, blankrows: true });
    expect(rows[2]!.slice(0, 4)).toEqual(['姓名', '員工編號', '職級', '12/07']);
    expect(rows[3]![3]).toBe('一');
    expect(rows[4]!.slice(0, 5)).toEqual([nurses[0]!.name, nurses[0]!.employeeId, nurses[0]!.level, 'D', 'D']);
    expect(rows[4]!.slice(3 + 28)).toEqual([20, 8, 0, 8, 8, 4]);
    const dRow = rows.find((r) => r[0] === '白班 D 人數')!;
    expect(dRow[3]).toBe(3);
    expect(rows.find((r) => r[0] === '白班 D 需求')![3]).toBe(10);
  });
});
