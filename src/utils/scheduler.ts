/**
 * Constraint validator, leave planner and auto-scheduler for 28-day nursing rosters.
 *
 * One cost model drives everything:
 *   - `evaluateSchedule()` runs it in "collect" mode and returns human-readable violations
 *     (used by the live grid, swap checks, e-mails and Excel export);
 *   - `solveSchedule()` runs the same functions in "cost only" mode inside a simulated-annealing
 *     search, so the auto-scheduler optimises exactly what the validator reports.
 *
 * Hard rules (severity "error", weight HARD):
 *   coverage_under      D/E/N headcount below demand (weekday D10 E6 N5 · weekend/holiday D8 E6 N5)
 *   senior_min          fewer than `minSeniorPerShift` N2+ nurses on a shift
 *   max_consecutive_work more than 5 consecutive working days (previous period tail included)
 *   max_consecutive_off  more than 3 consecutive non-working days, unless the run contains AL/OL
 *   weekly_off          fewer than 1 rest day (OFF/REQ) in a fixed 7-day week (例假)
 *   period_off          fewer than 8 rest days in the 28-day period (例假 4 + 休息日 4)
 *   shift_rest          less than `minRestHours` between shifts on consecutive days (勞基法 §34)
 *   shift_not_allowed   shift outside the nurse's allowed shifts
 * Soft rules (severity "warning"/"info"):
 *   coverage_over, senior_preferred, under_hours (+ pattern costs that are never reported).
 *
 * Leave priority: AL (年休) > OL (公假) > REQ (預假), then first-come-first-served.
 */
import { SHIFT_META } from '@/constants/labels';
import {
  WEEK_DAYS,
  type DayInfo,
  type LeaveRequest,
  type LeaveType,
  type NurseLevel,
  type RuleConfig,
  type ShiftCode,
  type ShiftTime,
  type Severity,
  type Violation,
  type WorkShift,
} from '@/types/schedule';
import { diffDays, formatMDW } from '@/utils/dates';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_RULES: RuleConfig = {
  weekdayDemand: { D: 10, E: 6, N: 5 },
  weekendDemand: { D: 8, E: 6, N: 5 },
  minSeniorPerShift: 1,
  preferredSeniorPerShift: 2,
  seniorLevels: ['N2', 'N3'],
  maxConsecutiveWork: 5,
  maxConsecutiveOff: 3,
  minOffPerWeek: 1,
  minOffPerPeriod: 8,
  minRestHours: 11,
  shiftTimes: {
    D: { start: '08:00', end: '16:00' },
    E: { start: '16:00', end: '24:00' },
    N: { start: '00:00', end: '08:00' },
  },
};

export const WEIGHTS = {
  hard: 1000,
  /** per extra nurse on D / E / N */
  over: [8, 15, 15] as const,
  seniorPreferred: 30,
  /** quadratic, per surplus rest day */
  underHours: 3,
  shiftSwitch: 4,
  isolatedWork: 6,
  isolatedOff: 2,
};

// ---------------------------------------------------------------------------
// Public input / output types
// ---------------------------------------------------------------------------

export interface PlannerNurse {
  id: string;
  name: string;
  level: NurseLevel;
  allowedShifts: WorkShift[];
}

export interface EvaluationInput {
  days: DayInfo[];
  nurses: PlannerNurse[];
  assignments: Record<string, ReadonlyArray<ShiftCode | null | undefined> | undefined>;
  /** Codes worked before day 0 (chronological, last element = the day before the period). */
  history?: Record<string, ShiftCode[]>;
  rules: RuleConfig;
}

export interface NurseStats {
  work: number;
  rest: number;
  leave: number;
  counts: Record<ShiftCode, number>;
  errors: number;
  warnings: number;
}

export interface EvaluationResult {
  violations: Violation[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  cost: number;
  /** cover[shift][day], senior[shift][day], demand[shift][day] */
  cover: Record<WorkShift, number[]>;
  senior: Record<WorkShift, number[]>;
  demand: Record<WorkShift, number[]>;
  nurseStats: Record<string, NurseStats>;
  /** `${nurseId}|${day}` → worst severity */
  cellSeverity: Record<string, Severity>;
  /** `${shift}|${day}` (headcount) and `S${shift}|${day}` (N2+) → worst severity */
  daySeverity: Record<string, Severity>;
}

export interface LeavePlacement {
  requestId: string;
  nurseId: string;
  nurseName: string;
  type: LeaveType;
  day: number;
  date: string;
  status: 'placed' | 'bumped' | 'skipped';
  reason?: string;
}

export interface LeavePlan {
  /** nurseId → per-day leave code (null = none) */
  cells: Record<string, (LeaveType | null)[]>;
  placements: LeavePlacement[];
}

export interface SolveInput {
  days: DayInfo[];
  nurses: PlannerNurse[];
  rules: RuleConfig;
  history?: Record<string, ShiftCode[]>;
  /** Existing assignments; only cells listed in `locks` are kept. */
  assignments?: Record<string, ReadonlyArray<ShiftCode | null | undefined> | undefined>;
  locks?: Record<string, number[]>;
  /** Approved leave requests to place (priority AL > OL > REQ). */
  leaveRequests?: LeaveRequest[];
  seed?: number;
  timeLimitMs?: number;
  maxIterations?: number;
}

export interface SolveProgress {
  progress: number;
  bestCost: number;
  hardViolations: number;
  iterations: number;
}

export interface SolveResult {
  assignments: Record<string, ShiftCode[]>;
  /** Manual locks + placed leave cells. */
  locks: Record<string, number[]>;
  evaluation: EvaluationResult;
  leave: LeavePlan;
  iterations: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

const CODES: readonly ShiftCode[] = ['D', 'E', 'N', 'OFF', 'AL', 'OL', 'REQ'];
const CODE_INDEX: Record<ShiftCode, number> = { D: 0, E: 1, N: 2, OFF: 3, AL: 4, OL: 5, REQ: 6 };
const WORK: readonly WorkShift[] = ['D', 'E', 'N'];
const OFF = 3;
const AL = 4;
const OL = 5;
const REQ = 6;

const isWork = (c: number) => c <= 2;
const isLeave = (c: number) => c === AL || c === OL;
const isRest = (c: number) => c === OFF || c === REQ;

function parseHours(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}

function shiftWindow(t: ShiftTime): [number, number] {
  const start = parseHours(t.start);
  let end = parseHours(t.end);
  if (end <= start) end += 24;
  return [start, end];
}

/** Rest hours between `prev` worked on day X and `next` worked on day X+1. */
export function restHoursBetween(rules: RuleConfig, prev: WorkShift, next: WorkShift): number {
  const [, prevEnd] = shiftWindow(rules.shiftTimes[prev]);
  const [nextStart] = shiftWindow(rules.shiftTimes[next]);
  return 24 + nextStart - prevEnd;
}

/** Transitions (prev → next day) forbidden by the minimum rest rule. */
export function forbiddenTransitions(rules: RuleConfig): [WorkShift, WorkShift][] {
  const out: [WorkShift, WorkShift][] = [];
  if (!rules.minRestHours) return out;
  for (const a of WORK) {
    for (const b of WORK) {
      if (restHoursBetween(rules, a, b) < rules.minRestHours) out.push([a, b]);
    }
  }
  return out;
}

export function demandFor(rules: RuleConfig, day: DayInfo): Record<WorkShift, number> {
  return day.isWeekend || day.isHoliday ? rules.weekendDemand : rules.weekdayDemand;
}

export function isSenior(rules: RuleConfig, level: NurseLevel): boolean {
  return rules.seniorLevels.includes(level);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Model {
  nN: number;
  nD: number;
  nW: number;
  ids: string[];
  names: string[];
  dates: string[];
  rules: RuleConfig;
  senior: Uint8Array;
  /** allowed[n*3+s] */
  allowed: Uint8Array;
  /** demand[d*3+s] */
  demand: Int16Array;
  /** forbid[prev*3+next] */
  forbid: Uint8Array;
  /** history aggregates */
  hWorkRun: Int16Array;
  hOffRun: Int16Array;
  hOffLeave: Uint8Array;
  hLast: Int8Array;
}

function buildModel(
  days: DayInfo[],
  nurses: PlannerNurse[],
  rules: RuleConfig,
  history: Record<string, ShiftCode[]> = {},
): Model {
  const nN = nurses.length;
  const nD = days.length;
  const senior = new Uint8Array(nN);
  const allowed = new Uint8Array(nN * 3);
  const hWorkRun = new Int16Array(nN);
  const hOffRun = new Int16Array(nN);
  const hOffLeave = new Uint8Array(nN);
  const hLast = new Int8Array(nN).fill(-1);

  nurses.forEach((nurse, n) => {
    senior[n] = isSenior(rules, nurse.level) ? 1 : 0;
    const allow = nurse.allowedShifts?.length ? nurse.allowedShifts : WORK;
    for (const s of allow) allowed[n * 3 + CODE_INDEX[s]] = 1;

    const h = history[nurse.id] ?? [];
    if (h.length) {
      const last = h[h.length - 1];
      hLast[n] = last ? CODE_INDEX[last] : -1;
      let i = h.length - 1;
      while (i >= 0 && isWork(CODE_INDEX[h[i]!])) {
        hWorkRun[n]!++;
        i--;
      }
      i = h.length - 1;
      while (i >= 0 && !isWork(CODE_INDEX[h[i]!])) {
        hOffRun[n]!++;
        if (isLeave(CODE_INDEX[h[i]!])) hOffLeave[n] = 1;
        i--;
      }
    }
  });

  const demand = new Int16Array(nD * 3);
  days.forEach((day, d) => {
    const dem = demandFor(rules, day);
    demand[d * 3] = dem.D;
    demand[d * 3 + 1] = dem.E;
    demand[d * 3 + 2] = dem.N;
  });

  const forbid = new Uint8Array(9);
  for (const [a, b] of forbiddenTransitions(rules)) forbid[CODE_INDEX[a] * 3 + CODE_INDEX[b]] = 1;

  return {
    nN,
    nD,
    nW: Math.ceil(nD / WEEK_DAYS),
    ids: nurses.map((x) => x.id),
    names: nurses.map((x) => x.name),
    dates: days.map((x) => x.date),
    rules,
    senior,
    allowed,
    demand,
    forbid,
    hWorkRun,
    hOffRun,
    hOffLeave,
    hLast,
  };
}

function encodeGrid(m: Model, assignments: EvaluationInput['assignments']): Int8Array {
  const g = new Int8Array(m.nN * m.nD).fill(OFF);
  m.ids.forEach((id, n) => {
    const row = assignments[id];
    if (!row) return;
    for (let d = 0; d < m.nD; d++) {
      const code = row[d];
      if (code) g[n * m.nD + d] = CODE_INDEX[code];
    }
  });
  return g;
}

function decodeGrid(m: Model, g: Int8Array): Record<string, ShiftCode[]> {
  const out: Record<string, ShiftCode[]> = {};
  m.ids.forEach((id, n) => {
    const row: ShiftCode[] = [];
    for (let d = 0; d < m.nD; d++) row.push(CODES[g[n * m.nD + d]!]!);
    out[id] = row;
  });
  return out;
}

function computeCover(m: Model, g: Int8Array): { cover: Int16Array; seniorCover: Int16Array } {
  const cover = new Int16Array(m.nD * 3);
  const seniorCover = new Int16Array(m.nD * 3);
  for (let n = 0; n < m.nN; n++) {
    for (let d = 0; d < m.nD; d++) {
      const c = g[n * m.nD + d]!;
      if (isWork(c)) {
        cover[d * 3 + c]!++;
        if (m.senior[n]) seniorCover[d * 3 + c]!++;
      }
    }
  }
  return { cover, seniorCover };
}

// ---------------------------------------------------------------------------
// Cost functions (shared by validator and solver)
// ---------------------------------------------------------------------------

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, from); i <= to; i++) out.push(i);
  return out;
}

/**
 * Cost of one nurse's row. When `out` is given, violations are appended to it.
 */
function evalNurse(m: Model, g: Int8Array, n: number, out: Violation[] | null): number {
  const { nD, rules } = m;
  const HARD = WEIGHTS.hard;
  const maxWork = rules.maxConsecutiveWork;
  const maxOff = rules.maxConsecutiveOff;
  const base = n * nD;
  const id = m.ids[n]!;
  const name = m.names[n]!;
  let cost = 0;

  let workRun = m.hWorkRun[n]!;
  let workStart = -workRun;
  let offRun = m.hOffRun[n]!;
  let offStart = -offRun;
  let offHasLeave = m.hOffLeave[n]!;
  let prev = m.hLast[n]!;
  let lastWork = -1;
  let rest = 0;
  let work = 0;
  let leave = 0;
  let switches = 0;

  const closeWork = (endDay: number) => {
    if (workRun > maxWork) {
      cost += HARD * (workRun - maxWork);
      out?.push({
        rule: 'max_consecutive_work',
        severity: 'error',
        nurseId: id,
        day: Math.max(0, endDay),
        days: range(workStart, endDay),
        message: `${name} 連續上班 ${workRun} 天（上限 ${maxWork} 天）`,
      });
    }
  };
  const closeOff = (endDay: number) => {
    if (offRun > maxOff && !offHasLeave) {
      cost += HARD * (offRun - maxOff);
      out?.push({
        rule: 'max_consecutive_off',
        severity: 'error',
        nurseId: id,
        day: Math.max(0, endDay),
        days: range(offStart, endDay),
        message: `${name} 連續休假 ${offRun} 天（上限 ${maxOff} 天）`,
      });
    }
  };

  for (let d = 0; d < nD; d++) {
    const c = g[base + d]!;
    if (isWork(c)) {
      if (offRun > 0) closeOff(d - 1);
      offRun = 0;
      offHasLeave = 0;
      if (workRun === 0) workStart = d;
      workRun++;
      work++;
      if (prev >= 0 && isWork(prev) && m.forbid[prev * 3 + c]) {
        cost += HARD;
        out?.push({
          rule: 'shift_rest',
          severity: 'error',
          nurseId: id,
          day: d,
          days: d > 0 ? [d - 1, d] : [d],
          message: `${name} ${formatMDW(m.dates[d]!)} ${CODES[prev]}→${CODES[c]} 班距不足 ${rules.minRestHours} 小時`,
        });
      }
      if (!m.allowed[n * 3 + c]) {
        cost += HARD;
        out?.push({
          rule: 'shift_not_allowed',
          severity: 'error',
          nurseId: id,
          day: d,
          days: [d],
          message: `${name} ${formatMDW(m.dates[d]!)} 不可排${SHIFT_META[CODES[c]!].label}`,
        });
      }
      if (lastWork >= 0 && lastWork !== c) switches++;
      lastWork = c;
      // Isolated single working day between two non-working days.
      if (d > 0 && d < nD - 1 && !isWork(g[base + d - 1]!) && !isWork(g[base + d + 1]!)) {
        cost += WEIGHTS.isolatedWork;
      }
    } else {
      if (workRun > 0) closeWork(d - 1);
      workRun = 0;
      if (offRun === 0) offStart = d;
      offRun++;
      if (isLeave(c)) {
        offHasLeave = 1;
        leave++;
      } else {
        rest++;
        if (d > 0 && d < nD - 1 && isWork(g[base + d - 1]!) && isWork(g[base + d + 1]!)) {
          cost += WEIGHTS.isolatedOff;
        }
      }
    }
    prev = c;
  }
  if (workRun > 0) closeWork(nD - 1);
  if (offRun > 0) closeOff(nD - 1);

  cost += switches * WEIGHTS.shiftSwitch;

  // 例假: at least `minOffPerWeek` rest days in every fixed 7-day week.
  for (let w = 0; w < m.nW; w++) {
    const from = w * WEEK_DAYS;
    const to = Math.min(nD, from + WEEK_DAYS);
    let restW = 0;
    let leaveW = 0;
    for (let d = from; d < to; d++) {
      const c = g[base + d]!;
      if (isRest(c)) restW++;
      else if (isLeave(c)) leaveW++;
    }
    const need = rules.minOffPerWeek;
    if (restW < need) {
      const fixable = to - from - leaveW >= need;
      if (fixable) cost += HARD * (need - restW);
      out?.push({
        rule: 'weekly_off',
        severity: fixable ? 'error' : 'warning',
        nurseId: id,
        day: from,
        days: range(from, to - 1),
        message: `${name} 第 ${w + 1} 週例假不足（${restW}/${need} 天）${fixable ? '' : '，該週皆為請假'}`,
      });
    }
  }

  // 例假 + 休息日 across the whole period.
  const minOff = rules.minOffPerPeriod;
  if (rest < minOff) {
    const fixable = nD - leave >= minOff;
    if (fixable) cost += HARD * (minOff - rest);
    out?.push({
      rule: 'period_off',
      severity: fixable ? 'error' : 'warning',
      nurseId: id,
      message: `${name} 四週休假 ${rest} 天（至少 ${minOff} 天）`,
    });
  } else if (rest > minOff && work > 0) {
    const extra = rest - minOff;
    cost += WEIGHTS.underHours * extra * extra;
    out?.push({
      rule: 'under_hours',
      severity: 'info',
      nurseId: id,
      message: `${name} 休假 ${rest} 天，較規定多 ${extra} 天（工時不足）`,
    });
  }

  return cost;
}

const SHIFT_NAMES = ['白班', '小夜', '大夜'] as const;

function evalDay(m: Model, cover: Int16Array, seniorCover: Int16Array, d: number, out: Violation[] | null): number {
  const { rules } = m;
  let cost = 0;
  for (let s = 0; s < 3; s++) {
    const need = m.demand[d * 3 + s]!;
    const have = cover[d * 3 + s]!;
    const sen = seniorCover[d * 3 + s]!;
    const shift = WORK[s]!;
    const label = `${formatMDW(m.dates[d]!)} ${SHIFT_NAMES[s]}`;
    if (have < need) {
      cost += WEIGHTS.hard * (need - have);
      out?.push({
        rule: 'coverage_under',
        severity: 'error',
        day: d,
        shift,
        message: `${label}人力不足 ${have}/${need}`,
      });
    } else if (have > need) {
      cost += WEIGHTS.over[s]! * (have - need);
      out?.push({
        rule: 'coverage_over',
        severity: 'warning',
        day: d,
        shift,
        message: `${label}人力過剩 ${have}/${need}`,
      });
    }
    if (need <= 0 && have <= 0) continue;
    const minS = Math.min(rules.minSeniorPerShift, Math.max(need, have));
    const prefS = Math.min(rules.preferredSeniorPerShift, Math.max(need, have));
    if (sen < minS) {
      cost += WEIGHTS.hard * (minS - sen);
      out?.push({
        rule: 'senior_min',
        severity: 'error',
        day: d,
        shift,
        message: `${label} N2+ 僅 ${sen} 人（至少 ${minS} 人）`,
      });
    } else if (sen < prefS) {
      cost += WEIGHTS.seniorPreferred * (prefS - sen);
      out?.push({
        rule: 'senior_preferred',
        severity: 'warning',
        day: d,
        shift,
        message: `${label} N2+ 僅 ${sen} 人（建議 ${prefS} 人）`,
      });
    }
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };

function worse(a: Severity | undefined, b: Severity): Severity {
  return !a || SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

function emptyCounts(): Record<ShiftCode, number> {
  return { D: 0, E: 0, N: 0, OFF: 0, AL: 0, OL: 0, REQ: 0 };
}

function evaluateModel(m: Model, g: Int8Array): EvaluationResult {
  const violations: Violation[] = [];
  let cost = 0;
  const nurseStats: Record<string, NurseStats> = {};

  for (let n = 0; n < m.nN; n++) {
    const before = violations.length;
    cost += evalNurse(m, g, n, violations);
    const counts = emptyCounts();
    for (let d = 0; d < m.nD; d++) counts[CODES[g[n * m.nD + d]!]!]++;
    const mine = violations.slice(before);
    nurseStats[m.ids[n]!] = {
      work: counts.D + counts.E + counts.N,
      rest: counts.OFF + counts.REQ,
      leave: counts.AL + counts.OL,
      counts,
      errors: mine.filter((v) => v.severity === 'error').length,
      warnings: mine.filter((v) => v.severity === 'warning').length,
    };
  }

  const { cover, seniorCover } = computeCover(m, g);
  for (let d = 0; d < m.nD; d++) cost += evalDay(m, cover, seniorCover, d, violations);

  const cellSeverity: Record<string, Severity> = {};
  const daySeverity: Record<string, Severity> = {};
  for (const v of violations) {
    if (v.severity === 'info') continue;
    if (v.nurseId && v.days) {
      for (const d of v.days) {
        const key = `${v.nurseId}|${d}`;
        cellSeverity[key] = worse(cellSeverity[key], v.severity);
      }
    }
    if (v.shift !== undefined && v.day !== undefined) {
      const senior = v.rule === 'senior_min' || v.rule === 'senior_preferred';
      const key = `${senior ? 'S' : ''}${v.shift}|${v.day}`;
      daySeverity[key] = worse(daySeverity[key], v.severity);
    }
  }

  const perShift = (arr: Int16Array): Record<WorkShift, number[]> => ({
    D: Array.from({ length: m.nD }, (_, d) => arr[d * 3]!),
    E: Array.from({ length: m.nD }, (_, d) => arr[d * 3 + 1]!),
    N: Array.from({ length: m.nD }, (_, d) => arr[d * 3 + 2]!),
  });

  const severityOrder = (v: Violation) => -SEVERITY_RANK[v.severity];
  violations.sort((a, b) => severityOrder(a) - severityOrder(b) || (a.day ?? 99) - (b.day ?? 99));

  return {
    violations,
    errorCount: violations.filter((v) => v.severity === 'error').length,
    warningCount: violations.filter((v) => v.severity === 'warning').length,
    infoCount: violations.filter((v) => v.severity === 'info').length,
    cost,
    cover: perShift(cover),
    senior: perShift(seniorCover),
    demand: perShift(m.demand),
    nurseStats,
    cellSeverity,
    daySeverity,
  };
}

/** Validate a (possibly partial) schedule against all rules. */
export function evaluateSchedule(input: EvaluationInput): EvaluationResult {
  const m = buildModel(input.days, input.nurses, input.rules, input.history);
  return evaluateModel(m, encodeGrid(m, input.assignments));
}

/** Keys identifying hard violations, used to diff "before vs after" (e.g. for swaps). */
export function violationKey(v: Violation): string {
  return [v.rule, v.nurseId ?? '', v.shift ?? '', v.day ?? '', v.days?.join(',') ?? ''].join('|');
}

/** Error-level violations present in `after` but not in `before`. */
export function newErrors(before: EvaluationResult, after: EvaluationResult): Violation[] {
  const seen = new Set(before.violations.filter((v) => v.severity === 'error').map(violationKey));
  return after.violations.filter((v) => v.severity === 'error' && !seen.has(violationKey(v)));
}

// ---------------------------------------------------------------------------
// Leave planning (AL > OL > REQ)
// ---------------------------------------------------------------------------

const LEAVE_PRIORITY: Record<LeaveType, number> = { AL: 0, OL: 1, REQ: 2 };

export function planLeave(params: {
  days: DayInfo[];
  nurses: PlannerNurse[];
  rules: RuleConfig;
  requests: LeaveRequest[];
  /** Cells already fixed (manual locks): nurseId → day → code */
  fixed?: Record<string, (ShiftCode | null)[]>;
}): LeavePlan {
  const { days, nurses, rules, requests, fixed = {} } = params;
  const nD = days.length;
  if (!nD) return { cells: {}, placements: [] };
  const startDate = days[0]!.date;
  const byId = new Map(nurses.map((n) => [n.id, n]));
  const cells: Record<string, (LeaveType | null)[]> = {};
  for (const n of nurses) cells[n.id] = new Array<LeaveType | null>(nD).fill(null);

  const dayNeed = days.map((d) => {
    const dem = demandFor(rules, d);
    return dem.D + dem.E + dem.N;
  });
  const seniorNeed = days.map((d) => {
    const dem = demandFor(rules, d);
    return WORK.filter((s) => dem[s] > 0).length * rules.minSeniorPerShift;
  });

  const available = new Array<number>(nD).fill(0);
  const availableSenior = new Array<number>(nD).fill(0);
  let capacity = 0;
  for (const n of nurses) {
    const row = fixed[n.id] ?? [];
    let fixedLeave = 0;
    for (let d = 0; d < nD; d++) {
      const code = row[d];
      if (code && !isWork(CODE_INDEX[code])) {
        if (isLeave(CODE_INDEX[code])) fixedLeave++;
        continue;
      }
      available[d]!++;
      if (isSenior(rules, n.level)) availableSenior[d]!++;
    }
    capacity += Math.max(0, nD - rules.minOffPerPeriod - fixedLeave);
  }
  const totalDemand = dayNeed.reduce((a, b) => a + b, 0);
  const reqCount = new Map<string, number>();
  for (const n of nurses) {
    reqCount.set(n.id, (fixed[n.id] ?? []).filter((c) => c === 'REQ').length);
  }

  const isOffAt = (id: string, d: number): boolean => {
    if (d < 0 || d >= nD) return false;
    const leave = cells[id]?.[d];
    if (leave) return true;
    const f = fixed[id]?.[d];
    return !!f && !isWork(CODE_INDEX[f]);
  };
  const leaveRunIfPlaced = (id: string, d: number): { run: number; hasLeave: boolean } => {
    let run = 1;
    let hasLeave = false;
    const check = (i: number) => {
      const code = cells[id]?.[i] ?? fixed[id]?.[i];
      if (code === 'AL' || code === 'OL') hasLeave = true;
    };
    for (let i = d - 1; isOffAt(id, i); i--) {
      run++;
      check(i);
    }
    for (let i = d + 1; isOffAt(id, i); i++) {
      run++;
      check(i);
    }
    return { run, hasLeave };
  };

  const sorted = [...requests]
    .filter((r) => r.status === 'approved')
    .sort((a, b) => LEAVE_PRIORITY[a.type] - LEAVE_PRIORITY[b.type] || a.createdAt - b.createdAt);

  const placements: LeavePlacement[] = [];
  for (const req of sorted) {
    const nurse = byId.get(req.nurseId);
    const from = Math.max(0, diffDays(startDate, req.startDate));
    const to = Math.min(nD - 1, diffDays(startDate, req.endDate));
    for (let d = from; d <= to; d++) {
      const base: LeavePlacement = {
        requestId: req.id,
        nurseId: req.nurseId,
        nurseName: req.nurseName,
        type: req.type,
        day: d,
        date: days[d]!.date,
        status: 'placed',
      };
      if (!nurse) {
        placements.push({ ...base, status: 'skipped', reason: '不在此班表' });
        continue;
      }
      if (fixed[nurse.id]?.[d]) {
        placements.push({ ...base, status: 'skipped', reason: '已手動鎖定' });
        continue;
      }
      if (cells[nurse.id]![d]) {
        placements.push({ ...base, status: 'skipped', reason: '同日已有假別' });
        continue;
      }
      const senior = isSenior(rules, nurse.level);
      let reason: string | undefined;
      if (available[d]! - 1 < dayNeed[d]!) reason = '當日人力不足';
      else if (senior && availableSenior[d]! - 1 < seniorNeed[d]!) reason = '當日 N2+ 人力不足';
      else if (req.type !== 'REQ' && capacity - 1 < totalDemand) reason = '四週總人力不足';
      else if (req.type === 'REQ') {
        if ((reqCount.get(nurse.id) ?? 0) >= rules.minOffPerPeriod) reason = `預假超過 ${rules.minOffPerPeriod} 天`;
        else {
          const { run, hasLeave } = leaveRunIfPlaced(nurse.id, d);
          if (run > rules.maxConsecutiveOff && !hasLeave) reason = `連續休假超過 ${rules.maxConsecutiveOff} 天`;
        }
      }
      if (reason) {
        placements.push({ ...base, status: 'bumped', reason });
        continue;
      }
      cells[nurse.id]![d] = req.type;
      available[d]!--;
      if (senior) availableSenior[d]!--;
      if (req.type === 'REQ') reqCount.set(nurse.id, (reqCount.get(nurse.id) ?? 0) + 1);
      else capacity--;
      placements.push(base);
    }
  }
  return { cells, placements };
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Greedy day-by-day construction that respects most hard rules. */
function constructInitial(m: Model, g: Int8Array, locked: Uint8Array, rnd: () => number): void {
  const { nN, nD, rules } = m;
  const maxWork = rules.maxConsecutiveWork;
  const maxOff = rules.maxConsecutiveOff;
  const workRun = Int16Array.from(m.hWorkRun);
  const offRun = Int16Array.from(m.hOffRun);
  const offLeave = Uint8Array.from(m.hOffLeave);
  const prev = Int8Array.from(m.hLast);

  for (let d = 0; d < nD; d++) {
    const w = Math.floor(d / WEEK_DAYS);
    const weekEnd = Math.min(nD, (w + 1) * WEEK_DAYS);
    const taken = new Uint8Array(nN);
    const mustRest = new Uint8Array(nN);
    const pressure = new Float64Array(nN);

    for (let n = 0; n < nN; n++) {
      const base = n * nD;
      if (locked[base + d]) {
        taken[n] = 1;
        continue;
      }
      // Rest days already fixed in the current week / period (past assignments + future locks).
      let restWeek = 0;
      let freeWeek = 0;
      for (let i = w * WEEK_DAYS; i < weekEnd; i++) {
        if (i < d || locked[base + i]) {
          if (isRest(g[base + i]!)) restWeek++;
        } else freeWeek++;
      }
      let restTotal = 0;
      let freeTotal = 0;
      for (let i = 0; i < nD; i++) {
        if (i < d || locked[base + i]) {
          if (isRest(g[base + i]!)) restTotal++;
        } else freeTotal++;
      }
      const needWeek = Math.max(0, rules.minOffPerWeek - restWeek);
      const needTotal = Math.max(0, rules.minOffPerPeriod - restTotal);
      if (workRun[n]! >= maxWork || (needWeek > 0 && freeWeek <= needWeek) || (needTotal > 0 && freeTotal <= needTotal)) {
        mustRest[n] = 1;
      }
      // Higher = should work today.
      pressure[n] = freeTotal > 0 ? 1 - needTotal / freeTotal : 0;
      if (offRun[n]! >= maxOff && !offLeave[n]) pressure[n]! += 10;
    }

    for (const s of [2, 1, 0]) {
      const need = m.demand[d * 3 + s]!;
      if (need <= 0) continue;
      const cands: { n: number; score: number }[] = [];
      for (let n = 0; n < nN; n++) {
        if (taken[n] || mustRest[n] || !m.allowed[n * 3 + s]) continue;
        const p = prev[n]!;
        if (p >= 0 && isWork(p) && m.forbid[p * 3 + s]) continue;
        let score = pressure[n]! * 100 + rnd() * 15;
        if (p === s) score += 40;
        if (workRun[n]! >= maxWork - 1) score -= 15;
        cands.push({ n, score });
      }
      cands.sort((a, b) => b.score - a.score);
      const picked: number[] = [];
      // Seniors first up to the preferred count, then best remaining candidates.
      for (const c of cands) {
        if (picked.length >= Math.min(need, rules.preferredSeniorPerShift)) break;
        if (m.senior[c.n]) picked.push(c.n);
      }
      for (const c of cands) {
        if (picked.length >= need) break;
        if (!picked.includes(c.n)) picked.push(c.n);
      }
      for (const n of picked) {
        g[n * nD + d] = s;
        taken[n] = 1;
      }
    }

    for (let n = 0; n < nN; n++) {
      const i = n * nD + d;
      if (!locked[i] && !taken[n]) g[i] = OFF;
      const c = g[i]!;
      if (isWork(c)) {
        workRun[n]!++;
        offRun[n] = 0;
        offLeave[n] = 0;
      } else {
        workRun[n] = 0;
        offRun[n]!++;
        if (isLeave(c)) offLeave[n] = 1;
      }
      prev[n] = c;
    }
  }
}

/**
 * Generate a 28-day schedule.
 * Locked cells (manual locks + placed leave) are never changed.
 */
export function solveSchedule(input: SolveInput, onProgress?: (p: SolveProgress) => void): SolveResult {
  const t0 = Date.now();
  const { days, nurses, rules } = input;
  const timeLimit = input.timeLimitMs ?? 6000;
  const maxIter = input.maxIterations ?? 2_000_000;
  const rnd = mulberry32(input.seed ?? (Date.now() & 0xffffffff));
  const m = buildModel(days, nurses, rules, input.history);
  const { nN, nD } = m;

  // 1. Fixed cells from manual locks.
  const fixed: Record<string, (ShiftCode | null)[]> = {};
  for (const nurse of nurses) {
    const row = new Array<ShiftCode | null>(nD).fill(null);
    for (const d of input.locks?.[nurse.id] ?? []) {
      const code = input.assignments?.[nurse.id]?.[d];
      if (d >= 0 && d < nD && code) row[d] = code;
    }
    fixed[nurse.id] = row;
  }

  // 2. Approved leave with priority AL > OL > REQ.
  const leave = planLeave({ days, nurses, rules, requests: input.leaveRequests ?? [], fixed });

  const g = new Int8Array(nN * nD).fill(OFF);
  const locked = new Uint8Array(nN * nD);
  const locks: Record<string, number[]> = {};
  nurses.forEach((nurse, n) => {
    const list: number[] = [];
    for (let d = 0; d < nD; d++) {
      const code = fixed[nurse.id]![d] ?? leave.cells[nurse.id]![d];
      if (code) {
        g[n * nD + d] = CODE_INDEX[code];
        locked[n * nD + d] = 1;
        list.push(d);
      }
    }
    locks[nurse.id] = list;
  });

  // 3. Greedy start.
  constructInitial(m, g, locked, rnd);

  // 4. Simulated annealing.
  const free: number[] = [];
  for (let i = 0; i < nN * nD; i++) if (!locked[i]) free.push(i);

  let iterations = 0;
  if (free.length > 1 && nN > 1) {
    const { cover, seniorCover } = computeCover(m, g);
    const nurseCost = new Float64Array(nN);
    const dayCost = new Float64Array(nD);
    let total = 0;
    for (let n = 0; n < nN; n++) total += nurseCost[n] = evalNurse(m, g, n, null);
    for (let d = 0; d < nD; d++) total += dayCost[d] = evalDay(m, cover, seniorCover, d, null);

    let best = total;
    const bestGrid = Int8Array.from(g);

    const setCell = (n: number, d: number, c: number) => {
      const i = n * nD + d;
      const old = g[i]!;
      if (old === c) return;
      if (isWork(old)) {
        cover[d * 3 + old]!--;
        if (m.senior[n]) seniorCover[d * 3 + old]!--;
      }
      g[i] = c;
      if (isWork(c)) {
        cover[d * 3 + c]!++;
        if (m.senior[n]) seniorCover[d * 3 + c]!++;
      }
    };

    const touchedNurses: number[] = [];
    const touchedDays: number[] = [];
    const changes: number[] = []; // flat triples: n, d, oldCode
    const T0 = 120;
    const T1 = 0.3;
    let T = T0;
    let badDays: number[] = [];
    let badNurses: number[] = [];

    const refreshBad = () => {
      badDays = [];
      badNurses = [];
      for (let d = 0; d < nD; d++) if (dayCost[d]! >= WEIGHTS.hard) badDays.push(d);
      for (let n = 0; n < nN; n++) if (nurseCost[n]! >= WEIGHTS.hard) badNurses.push(n);
    };
    refreshBad();

    const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
    const isFree = (n: number, d: number) => !locked[n * nD + d];
    const change = (n: number, d: number, c: number) => {
      changes.push(n, d, g[n * nD + d]!);
      setCell(n, d, c);
      if (!touchedNurses.includes(n)) touchedNurses.push(n);
      if (!touchedDays.includes(d)) touchedDays.push(d);
    };

    while (iterations < maxIter) {
      iterations++;
      if ((iterations & 1023) === 0) {
        const elapsed = Date.now() - t0;
        const progress = Math.max(iterations / maxIter, elapsed / timeLimit);
        if (progress >= 1) break;
        T = T0 * Math.pow(T1 / T0, progress);
        if ((iterations & 16383) === 0) {
          refreshBad();
          if (onProgress && (iterations & 131071) === 0) {
            onProgress({ progress, bestCost: best, hardViolations: Math.floor(best / WEIGHTS.hard), iterations });
          }
        }
      }

      touchedNurses.length = 0;
      touchedDays.length = 0;
      changes.length = 0;

      const r = rnd();
      const targeted = rnd() < 0.5;
      if (r < 0.4) {
        // Swap two nurses' cells on the same day (keeps headcount).
        const d = targeted && badDays.length ? pick(badDays) : Math.floor(rnd() * nD);
        const a = targeted && badNurses.length ? pick(badNurses) : Math.floor(rnd() * nN);
        const b = Math.floor(rnd() * nN);
        if (a === b || !isFree(a, d) || !isFree(b, d)) continue;
        const ca = g[a * nD + d]!;
        const cb = g[b * nD + d]!;
        if (ca === cb) continue;
        change(a, d, cb);
        change(b, d, ca);
      } else if (r < 0.65) {
        // Swap two days within one nurse's row (keeps the nurse's totals).
        const n = targeted && badNurses.length ? pick(badNurses) : Math.floor(rnd() * nN);
        const d1 = Math.floor(rnd() * nD);
        const d2 = Math.floor(rnd() * nD);
        if (d1 === d2 || !isFree(n, d1) || !isFree(n, d2)) continue;
        const c1 = g[n * nD + d1]!;
        const c2 = g[n * nD + d2]!;
        if (c1 === c2) continue;
        change(n, d1, c2);
        change(n, d2, c1);
      } else if (r < 0.85) {
        // Change a single cell.
        let n: number;
        let d: number;
        if (targeted && badDays.length && rnd() < 0.5) {
          d = pick(badDays);
          n = Math.floor(rnd() * nN);
        } else {
          n = targeted && badNurses.length ? pick(badNurses) : Math.floor(rnd() * nN);
          d = Math.floor(rnd() * nD);
        }
        if (!isFree(n, d)) continue;
        const c = Math.floor(rnd() * 4); // D/E/N/OFF
        if (c === g[n * nD + d] || (isWork(c) && !m.allowed[n * 3 + c])) continue;
        change(n, d, c);
      } else {
        // Exchange a 2–4 day block between two nurses.
        const a = targeted && badNurses.length ? pick(badNurses) : Math.floor(rnd() * nN);
        const b = Math.floor(rnd() * nN);
        if (a === b) continue;
        const len = 2 + Math.floor(rnd() * 3);
        const start = Math.floor(rnd() * (nD - len + 1));
        for (let d = start; d < start + len; d++) {
          if (!isFree(a, d) || !isFree(b, d)) continue;
          const ca = g[a * nD + d]!;
          const cb = g[b * nD + d]!;
          if (ca === cb) continue;
          change(a, d, cb);
          change(b, d, ca);
        }
        if (!changes.length) continue;
      }

      let oldCost = 0;
      let newCost = 0;
      const newNurse: number[] = [];
      const newDay: number[] = [];
      for (const n of touchedNurses) {
        oldCost += nurseCost[n]!;
        const c = evalNurse(m, g, n, null);
        newNurse.push(c);
        newCost += c;
      }
      for (const d of touchedDays) {
        oldCost += dayCost[d]!;
        const c = evalDay(m, cover, seniorCover, d, null);
        newDay.push(c);
        newCost += c;
      }
      const delta = newCost - oldCost;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
        touchedNurses.forEach((n, i) => (nurseCost[n] = newNurse[i]!));
        touchedDays.forEach((d, i) => (dayCost[d] = newDay[i]!));
        total += delta;
        if (total < best - 1e-9) {
          best = total;
          bestGrid.set(g);
          if (best <= 0) break;
        }
      } else {
        for (let i = changes.length - 3; i >= 0; i -= 3) setCell(changes[i]!, changes[i + 1]!, changes[i + 2]!);
      }
    }
    g.set(bestGrid);
  }

  const evaluation = evaluateModel(m, g);
  onProgress?.({ progress: 1, bestCost: evaluation.cost, hardViolations: evaluation.errorCount, iterations });
  return {
    assignments: decodeGrid(m, g),
    locks,
    evaluation,
    leave,
    iterations,
    elapsedMs: Date.now() - t0,
  };
}

/** Apply a cell swap between two nurses on two (possibly identical) days. */
export function applySwap(
  assignments: Record<string, ShiftCode[]>,
  a: string,
  b: string,
  dayA: number,
  dayB: number,
): Record<string, ShiftCode[]> {
  const out = { ...assignments };
  const rowA = [...(assignments[a] ?? [])];
  const rowB = [...(assignments[b] ?? [])];
  for (const d of new Set([dayA, dayB])) {
    const tmp = rowA[d]!;
    rowA[d] = rowB[d]!;
    rowB[d] = tmp;
  }
  out[a] = rowA;
  out[b] = rowB;
  return out;
}
