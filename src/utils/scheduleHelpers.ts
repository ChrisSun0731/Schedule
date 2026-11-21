/**
 * Glue between stored `Schedule` documents and the pure scheduler functions.
 */
import type { DayInfo, RuleConfig, Schedule, ShiftCode, SwapRequest, Violation } from '@/types/schedule';
import { PERIOD_DAYS, isLeaveDay, isWorkShift } from '@/types/schedule';
import { addDays, buildDays } from '@/utils/dates';
import { applySwap, evaluateSchedule, newErrors, type EvaluationResult, type PlannerNurse } from '@/utils/scheduler';
import type { SwapCells } from '@/services/emailTemplates';

export function scheduleDays(schedule: Pick<Schedule, 'startDate' | 'holidays'>): DayInfo[] {
  return buildDays(schedule.startDate, schedule.holidays ?? []);
}

export function plannerNurses(schedule: Pick<Schedule, 'nurseOrder' | 'nurses'>): PlannerNurse[] {
  return schedule.nurseOrder
    .map((id) => schedule.nurses[id])
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map((n) => ({ id: n.id, name: n.name, level: n.level, allowedShifts: n.allowedShifts ?? ['D', 'E', 'N'] }));
}

/** Last 7 days of the period that ends the day before `schedule` starts. */
export function historyFrom(schedule: Pick<Schedule, 'startDate'>, previous: Schedule | null | undefined): Record<string, ShiftCode[]> {
  if (!previous || addDays(previous.endDate, 1) !== schedule.startDate) return {};
  const out: Record<string, ShiftCode[]> = {};
  for (const [id, row] of Object.entries(previous.assignments ?? {})) out[id] = row.slice(-7);
  return out;
}

export function evaluateScheduleDoc(
  schedule: Schedule,
  rules: RuleConfig,
  previous?: Schedule | null,
  assignments: Record<string, ShiftCode[]> = schedule.assignments,
): EvaluationResult {
  return evaluateSchedule({
    days: scheduleDays(schedule),
    nurses: plannerNurses(schedule),
    assignments,
    history: historyFrom(schedule, previous),
    rules,
  });
}

export function emptyRow(): ShiftCode[] {
  return Array<ShiftCode>(PERIOD_DAYS).fill('OFF');
}

type SwapShape = Pick<
  SwapRequest,
  'requesterId' | 'targetId' | 'requesterDay' | 'targetDay' | 'requesterShift' | 'targetShift'
>;

export function swapCells(schedule: Schedule, swap: SwapShape): SwapCells {
  const a = schedule.assignments[swap.requesterId] ?? emptyRow();
  const b = schedule.assignments[swap.targetId] ?? emptyRow();
  return {
    requester: [a[swap.requesterDay] ?? 'OFF', a[swap.targetDay] ?? 'OFF'],
    target: [b[swap.requesterDay] ?? 'OFF', b[swap.targetDay] ?? 'OFF'],
  };
}

export interface SwapCheck {
  /** Reason the swap cannot be applied at all (data changed, leave involved…). */
  blocked: string | null;
  /** Hard-rule violations the swap would introduce. */
  introduced: Violation[];
  after: Record<string, ShiftCode[]>;
}

/** Why a swap cannot be applied to the schedule as it is now (null = it can). */
export function swapBlockedReason(schedule: Schedule, swap: SwapShape): string | null {
  const cells = swapCells(schedule, swap);
  if (swap.requesterId === swap.targetId) return '不可與自己換班';
  if (!schedule.assignments[swap.requesterId] || !schedule.assignments[swap.targetId]) return '人員不在此班表';
  if (cells.requester[0] !== swap.requesterShift || cells.target[1] !== swap.targetShift) return '班表已變更，請重新申請';
  if (!isWorkShift(cells.requester[0]) || !isWorkShift(cells.target[1])) return '僅能交換 D / E / N 班';
  if ([...cells.requester, ...cells.target].some((c) => isLeaveDay(c) || c === 'REQ')) return '涉及請假或預假的日期不可換班';
  return null;
}

export function checkSwap(schedule: Schedule, swap: SwapShape, rules: RuleConfig, previous?: Schedule | null): SwapCheck {
  const after = applySwap(schedule.assignments, swap.requesterId, swap.targetId, swap.requesterDay, swap.targetDay);
  const blocked = swapBlockedReason(schedule, swap);
  if (blocked) return { blocked, introduced: [], after };

  const before = evaluateScheduleDoc(schedule, rules, previous);
  const afterEval = evaluateScheduleDoc(schedule, rules, previous, after);
  return { blocked: null, introduced: newErrors(before, afterEval), after };
}
