import { describe, expect, it } from 'vitest';
import { createDemoNurses } from '@/services/demoData';
import type { DayInfo, LeaveRequest, RuleConfig, ShiftCode } from '@/types/schedule';
import { buildDays } from '@/utils/dates';
import {
  DEFAULT_RULES,
  applySwap,
  demandFor,
  evaluateSchedule,
  forbiddenTransitions,
  newErrors,
  planLeave,
  solveSchedule,
  type PlannerNurse,
} from '@/utils/scheduler';

const START = '2026-12-07'; // Monday
const days = buildDays(START, [18]); // one public holiday on day 19
const nurses: PlannerNurse[] = createDemoNurses().map((u) => ({
  id: u.id,
  name: u.displayName,
  level: u.level,
  allowedShifts: u.allowedShifts,
}));

function leave(id: string, nurseId: string, type: LeaveRequest['type'], start: string, end: string, createdAt = 1): LeaveRequest {
  return { id, wardId: 'w1', nurseId, nurseName: nurseId, type, startDate: start, endDate: end, note: '', status: 'approved', createdAt, updatedAt: createdAt };
}

/**
 * Independent, deliberately naive re-implementation of the hard rules,
 * used to cross-check both the solver output and the validator.
 */
function bruteForceHardViolations(
  ds: DayInfo[],
  ns: PlannerNurse[],
  a: Record<string, ShiftCode[]>,
  rules: RuleConfig,
): string[] {
  const out: string[] = [];
  const work = (c?: ShiftCode) => c === 'D' || c === 'E' || c === 'N';
  const rest = (c?: ShiftCode) => c === 'OFF' || c === 'REQ';
  const forbidden = new Set(forbiddenTransitions(rules).map(([x, y]) => `${x}${y}`));

  for (const d of ds) {
    const demand = demandFor(rules, d);
    for (const s of ['D', 'E', 'N'] as const) {
      const on = ns.filter((n) => a[n.id]![d.index] === s);
      if (on.length < demand[s]) out.push(`cover ${d.index}${s}`);
      if (on.filter((n) => rules.seniorLevels.includes(n.level)).length < rules.minSeniorPerShift) out.push(`senior ${d.index}${s}`);
    }
  }
  for (const n of ns) {
    const row = a[n.id]!;
    for (let i = 0; i + rules.maxConsecutiveWork < row.length; i++) {
      if (row.slice(i, i + rules.maxConsecutiveWork + 1).every(work)) out.push(`work-run ${n.id}@${i}`);
    }
    for (let i = 0; i + rules.maxConsecutiveOff < row.length; i++) {
      const win = row.slice(i, i + rules.maxConsecutiveOff + 1);
      if (win.every((c) => !work(c)) && !win.some((c) => !rest(c))) out.push(`off-run ${n.id}@${i}`);
    }
    for (let w = 0; w < 4; w++) {
      if (row.slice(w * 7, w * 7 + 7).filter(rest).length < rules.minOffPerWeek) out.push(`week ${n.id}#${w}`);
    }
    if (row.filter(rest).length < rules.minOffPerPeriod) out.push(`period ${n.id}`);
    for (let i = 1; i < row.length; i++) {
      if (work(row[i - 1]) && work(row[i]) && forbidden.has(`${row[i - 1]}${row[i]}`)) out.push(`rest ${n.id}@${i}`);
    }
    row.forEach((c, i) => {
      if (work(c) && !n.allowedShifts.includes(c as 'D')) out.push(`allowed ${n.id}@${i}`);
    });
  }
  return out;
}

function rowOf(pattern: string): ShiftCode[] {
  return pattern.split(' ').filter(Boolean) as ShiftCode[];
}

describe('forbiddenTransitions (11 h rest, D 08–16 / E 16–24 / N 00–08)', () => {
  it('forbids D→N, E→D, E→N only', () => {
    const pairs = forbiddenTransitions(DEFAULT_RULES).map(([a, b]) => `${a}${b}`).sort();
    expect(pairs).toEqual(['DN', 'ED', 'EN']);
  });
  it('can be disabled', () => {
    expect(forbiddenTransitions({ ...DEFAULT_RULES, minRestHours: 0 })).toEqual([]);
  });
});

describe('evaluateSchedule – nurse rules', () => {
  const one = [nurses[0]!];
  const evalRow = (row: ShiftCode[], history?: ShiftCode[]) =>
    evaluateSchedule({
      days,
      nurses: one,
      rules: DEFAULT_RULES,
      assignments: { [one[0]!.id]: row },
      history: history ? { [one[0]!.id]: history } : {},
    }).violations.filter((v) => v.nurseId);

  // 4 weeks of "5 on, 2 off" — fully compliant.
  const good = rowOf('D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF');

  it('accepts a compliant 5-on/2-off pattern', () => {
    expect(evalRow(good).filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('flags more than 5 consecutive working days', () => {
    const row = rowOf('D D D D D D OFF D D D D OFF OFF OFF D D D D D OFF OFF D D D D OFF OFF OFF');
    const v = evalRow(row).find((x) => x.rule === 'max_consecutive_work');
    expect(v?.days).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('counts the previous period tail toward consecutive work', () => {
    const v = evalRow(good, rowOf('OFF D D')).find((x) => x.rule === 'max_consecutive_work');
    expect(v?.message).toContain('連續上班 7 天');
  });

  it('flags more than 3 consecutive days off, but not when the run contains AL/OL', () => {
    const tooLong = rowOf('OFF OFF OFF OFF D D D D D OFF D D D D D OFF OFF D D D D D OFF OFF D D D D');
    expect(evalRow(tooLong).some((v) => v.rule === 'max_consecutive_off')).toBe(true);
    const withLeave = rowOf('OFF AL AL OFF D D D D D OFF D D D D D OFF OFF D D D D D OFF OFF D D D OFF');
    expect(evalRow(withLeave).some((v) => v.rule === 'max_consecutive_off')).toBe(false);
  });

  it('requires a rest day in every fixed 7-day week', () => {
    const row = rowOf('D D D D D AL AL D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF');
    const v = evalRow(row).filter((x) => x.rule === 'weekly_off');
    expect(v).toHaveLength(1);
    expect(v[0]!.severity).toBe('error');
    expect(v[0]!.day).toBe(0);
  });

  it('downgrades the weekly rule to a warning when the whole week is leave', () => {
    const row = rowOf('AL AL AL AL AL AL AL D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D');
    const weekly = evalRow(row).filter((x) => x.rule === 'weekly_off');
    expect(weekly.map((x) => x.severity)).toEqual(['warning']);
  });

  it('treats every new leave type like AL: exempts long off-runs, never counts as rest', () => {
    for (const code of ['SL', 'PL', 'MNL', 'CO', 'BL', 'WL', 'MAT', 'PAT', 'IL'] as const) {
      const row = rowOf(`OFF ${code} ${code} OFF D D D D D OFF D D D D D OFF OFF D D D D D OFF OFF D D D D`);
      const v = evalRow(row);
      expect(v.some((x) => x.rule === 'max_consecutive_off'), code).toBe(false);
      // 7 rest days (OFF) – the two leave days are not rest.
      expect(v.find((x) => x.rule === 'period_off')?.message, code).toContain('7 天');
    }
  });

  it('requires 8 rest days per 28 days (AL/OL do not count)', () => {
    const row = rowOf('D D D D D OFF AL D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF');
    const v = evalRow(row).find((x) => x.rule === 'period_off');
    expect(v?.severity).toBe('error');
    expect(v?.message).toContain('7 天');
  });

  it('flags insufficient rest between shifts (E→D) but allows N→D', () => {
    const ed = rowOf('E D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF');
    expect(evalRow(ed).some((v) => v.rule === 'shift_rest' && v.day === 1)).toBe(true);
    const nd = rowOf('N D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF');
    expect(evalRow(nd).some((v) => v.rule === 'shift_rest')).toBe(false);
  });

  it('flags shifts outside allowedShifts', () => {
    const dayOnly: PlannerNurse = { ...nurses[0]!, allowedShifts: ['D'] };
    const res = evaluateSchedule({
      days,
      nurses: [dayOnly],
      rules: DEFAULT_RULES,
      assignments: { [dayOnly.id]: rowOf('N N N N N OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF') },
    });
    expect(res.violations.filter((v) => v.rule === 'shift_not_allowed')).toHaveLength(5);
  });
});

describe('evaluateSchedule – daily coverage & skill mix', () => {
  it('reports under/over staffing and missing N2+ per shift', () => {
    const assignments: Record<string, ShiftCode[]> = {};
    nurses.forEach((n) => (assignments[n.id] = Array<ShiftCode>(28).fill('OFF')));
    // Day 0 (Mon): 11 D, 6 E with juniors only, 4 N.
    const juniors = nurses.filter((n) => n.level === 'N0' || n.level === 'N1');
    nurses.slice(0, 11).forEach((n) => (assignments[n.id]![0] = 'D'));
    juniors.slice(-6).forEach((n) => (assignments[n.id]![0] = 'E'));
    nurses.slice(11, 15).forEach((n) => (assignments[n.id]![0] = 'N'));
    const res = evaluateSchedule({ days, nurses, rules: DEFAULT_RULES, assignments });
    const day0 = res.violations.filter((v) => v.day === 0 && v.shift);
    expect(day0.find((v) => v.shift === 'D')?.rule).toBe('coverage_over');
    expect(day0.find((v) => v.shift === 'N' && v.rule === 'coverage_under')?.message).toContain('4/5');
    expect(day0.some((v) => v.shift === 'E' && v.rule === 'senior_min')).toBe(true);
    expect(res.cover.D[0]).toBe(11);
    expect(res.demand.D[5]).toBe(8); // Saturday
    expect(res.demand.D[18]).toBe(8); // holiday
    expect(res.daySeverity['SE|0']).toBe('error');
  });
});

describe('planLeave – statutory leave first, then AL > OL > CO > PL > REQ', () => {
  it('always places statutory leave, even on a day with no spare capacity', () => {
    const few = nurses.slice(0, 22); // weekday demand 21 → 1 spare on day 0
    const requests = [
      leave('al', few[0]!.id, 'AL', START, START, 1), // oldest – takes the only spare slot
      leave('sl', few[1]!.id, 'SL', START, START, 2),
      leave('bl', few[2]!.id, 'BL', START, START, 3),
    ];
    const plan = planLeave({ days, nurses: few, rules: { ...DEFAULT_RULES, minOffPerPeriod: 0 }, requests });
    const status = Object.fromEntries(plan.placements.map((p) => [p.requestId, p.status]));
    expect(status).toEqual({ sl: 'placed', bl: 'placed', al: 'bumped' });
  });

  it('orders discretionary leave AL > OL > CO > PL > REQ', () => {
    const few = nurses.slice(0, 24); // 3 spare on day 0
    const requests = [
      leave('req', few[0]!.id, 'REQ', START, START, 1),
      leave('pl', few[1]!.id, 'PL', START, START, 2),
      leave('co', few[2]!.id, 'CO', START, START, 3),
      leave('ol', few[3]!.id, 'OL', START, START, 4),
      leave('al', few[4]!.id, 'AL', START, START, 5),
    ];
    const plan = planLeave({ days, nurses: few, rules: { ...DEFAULT_RULES, minOffPerPeriod: 0 }, requests });
    const status = Object.fromEntries(plan.placements.map((p) => [p.requestId, p.status]));
    expect(status).toEqual({ al: 'placed', ol: 'placed', co: 'placed', pl: 'bumped', req: 'bumped' });
  });

  it('lets a REQ run longer than the off limit when it touches other leave', () => {
    const plan = planLeave({
      days,
      nurses,
      rules: DEFAULT_RULES,
      requests: [leave('sl', nurses[3]!.id, 'SL', '2026-12-07', '2026-12-08'), leave('r', nurses[3]!.id, 'REQ', '2026-12-09', '2026-12-10', 2)],
    });
    expect(plan.placements.map((p) => p.status)).toEqual(['placed', 'placed', 'placed', 'placed']);
  });
});

describe('planLeave – priority AL > OL > REQ', () => {
  it('bumps lower-priority leave first when a day has no spare capacity', () => {
    const few = nurses.slice(0, 23); // 23 nurses, weekday demand 21 → 2 spare on day 0
    const requests = [
      leave('req', few[0]!.id, 'REQ', START, START, 1), // oldest, but lowest priority
      leave('ol', few[1]!.id, 'OL', START, START, 2),
      leave('al', few[2]!.id, 'AL', START, START, 3),
    ];
    const plan = planLeave({ days, nurses: few, rules: { ...DEFAULT_RULES, minOffPerPeriod: 0 }, requests });
    const status = Object.fromEntries(plan.placements.map((p) => [p.requestId, p.status]));
    expect(status).toEqual({ al: 'placed', ol: 'placed', req: 'bumped' });
  });

  it('caps REQ runs at the consecutive-off limit', () => {
    const plan = planLeave({
      days,
      nurses,
      rules: DEFAULT_RULES,
      requests: [leave('r', nurses[3]!.id, 'REQ', '2026-12-07', '2026-12-10')],
    });
    expect(plan.placements.map((p) => p.status)).toEqual(['placed', 'placed', 'placed', 'bumped']);
  });
});

describe('solveSchedule', () => {
  const requests = [
    leave('l1', nurses[0]!.id, 'AL', '2026-12-09', '2026-12-12', 1),
    leave('l2', nurses[5]!.id, 'OL', '2026-12-15', '2026-12-15', 2),
    leave('l3', nurses[10]!.id, 'REQ', '2026-12-24', '2026-12-25', 3),
  ];

  it('produces a schedule with no hard violations (validator + brute force agree)', () => {
    const res = solveSchedule({ days, nurses, rules: DEFAULT_RULES, leaveRequests: requests, seed: 42, timeLimitMs: 20_000 });
    expect(res.evaluation.errorCount).toBe(0);
    expect(bruteForceHardViolations(days, nurses, res.assignments, DEFAULT_RULES)).toEqual([]);
    // leave placed and locked
    expect(res.assignments[nurses[0]!.id]!.slice(2, 6)).toEqual(['AL', 'AL', 'AL', 'AL']);
    expect(res.locks[nurses[0]!.id]).toEqual([2, 3, 4, 5]);
    expect(res.assignments[nurses[10]!.id]!.slice(17, 19)).toEqual(['REQ', 'REQ']);
  });

  it('keeps manually locked cells', () => {
    const assignments = { [nurses[7]!.id]: Array<ShiftCode>(28).fill('OFF') };
    assignments[nurses[7]!.id]![0] = 'N';
    assignments[nurses[7]!.id]![1] = 'N';
    const res = solveSchedule({
      days,
      nurses,
      rules: DEFAULT_RULES,
      assignments,
      locks: { [nurses[7]!.id]: [0, 1] },
      seed: 7,
      timeLimitMs: 20_000,
    });
    expect(res.assignments[nurses[7]!.id]!.slice(0, 2)).toEqual(['N', 'N']);
    expect(res.evaluation.errorCount).toBe(0);
  });

  it('honours the previous period tail', () => {
    const history = { [nurses[2]!.id]: rowOf('D D D D D') };
    const res = solveSchedule({ days, nurses, rules: DEFAULT_RULES, history, seed: 3, timeLimitMs: 20_000 });
    expect(res.assignments[nurses[2]!.id]![0]).not.toMatch(/^[DEN]$/);
    expect(res.evaluation.errorCount).toBe(0);
  });

  it('reports unavoidable shortages instead of failing', () => {
    const tooFew = nurses.slice(0, 20);
    const res = solveSchedule({ days, nurses: tooFew, rules: DEFAULT_RULES, seed: 1, timeLimitMs: 3000 });
    expect(res.evaluation.errorCount).toBeGreaterThan(0);
    expect(res.evaluation.violations.some((v) => v.rule === 'coverage_under')).toBe(true);
  });
});

describe('applySwap / newErrors', () => {
  it('swaps both cells on both days and detects newly introduced errors', () => {
    const a = nurses[0]!.id;
    const b = nurses[1]!.id;
    const base: Record<string, ShiftCode[]> = {
      [a]: rowOf('D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF'),
      [b]: rowOf('OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D OFF OFF D D D D D'),
    };
    const swapped = applySwap(base, a, b, 0, 1);
    expect(swapped[a]!.slice(0, 3)).toEqual(['OFF', 'OFF', 'D']);
    expect(swapped[b]!.slice(0, 3)).toEqual(['D', 'D', 'D']);
    const pair = nurses.slice(0, 2);
    const before = evaluateSchedule({ days, nurses: pair, rules: DEFAULT_RULES, assignments: base });
    const after = evaluateSchedule({ days, nurses: pair, rules: DEFAULT_RULES, assignments: swapped });
    const introduced = newErrors(before, after).filter((v) => v.nurseId);
    // b now works days 0–6 (7 in a row), has no weekly rest day and only 6 rest days in total.
    expect(introduced.map((v) => v.rule).sort()).toEqual(['max_consecutive_work', 'period_off', 'weekly_off']);
    expect(introduced.every((v) => v.nurseId === b)).toBe(true);
  });
});
