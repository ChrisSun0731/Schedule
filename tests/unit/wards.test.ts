import { describe, expect, it } from 'vitest';
import { DEMO_WARD_IDS, createDemoHeadNurse, createDemoIcuNurses, createDemoNurses, createDemoWards } from '@/services/demoData';
import { findLegacy, legacyCount } from '@/services/wardMigration';
import type { LeaveRequest, Schedule, SwapRequest, UserProfile } from '@/types/schedule';
import { buildDays } from '@/utils/dates';
import { DEFAULT_RULES, solveSchedule } from '@/utils/scheduler';
import { normalizeWard, rulesForWard, scheduleIdOf, wardRulesOf } from '@/utils/wards';

describe('ward helpers', () => {
  it('builds one schedule id per ward and period', () => {
    expect(scheduleIdOf('abc', '2026-12-07')).toBe('abc_2026-12-07');
    expect(scheduleIdOf('abc', '2026-12-07')).not.toBe(scheduleIdOf('xyz', '2026-12-07'));
  });

  it('overrides only staffing fields; labour rules stay hospital-wide', () => {
    const [, icu] = createDemoWards();
    const base = { ...DEFAULT_RULES, maxConsecutiveWork: 4, minRestHours: 12 };
    const r = rulesForWard(base, icu);
    expect(r.weekdayDemand).toEqual({ D: 4, E: 3, N: 3 });
    expect(r.weekendDemand).toEqual({ D: 4, E: 3, N: 3 });
    expect(r.maxConsecutiveWork).toBe(4);
    expect(r.minRestHours).toBe(12);
    expect(r.shiftTimes).toBe(base.shiftTimes);
    // a copy, so editing the result cannot change the ward
    r.weekdayDemand.D = 99;
    expect(icu!.weekdayDemand.D).toBe(4);
    expect(rulesForWard(base, null)).toBe(base);
  });

  it('normalizes partial or invalid ward documents', () => {
    const w = normalizeWard('w1', { name: ' ', weekdayDemand: { D: -1, E: 2.7 }, minSeniorPerShift: 'x' });
    expect(w.name).toBe('w1');
    expect(w.weekdayDemand).toEqual({ D: DEFAULT_RULES.weekdayDemand.D, E: 2, N: DEFAULT_RULES.weekdayDemand.N });
    expect(w.weekendDemand).toEqual(DEFAULT_RULES.weekendDemand);
    expect(w.minSeniorPerShift).toBe(DEFAULT_RULES.minSeniorPerShift);
    expect(w.requireHeadApproval).toBe(false);
    expect(wardRulesOf(w)).not.toHaveProperty('name');
  });
});

describe('demo wards', () => {
  it('puts every demo nurse on exactly one ward and the head nurse on both', () => {
    const general = createDemoNurses();
    const icu = createDemoIcuNurses();
    expect(general).toHaveLength(30);
    expect(icu).toHaveLength(16);
    expect(new Set([...general, ...icu].map((u) => u.id)).size).toBe(46);
    expect(general.every((u) => u.wardIds.length === 1 && u.wardIds[0] === DEMO_WARD_IDS.general)).toBe(true);
    expect(icu.every((u) => u.wardIds.length === 1 && u.wardIds[0] === DEMO_WARD_IDS.icu)).toBe(true);
    expect(createDemoHeadNurse().wardIds).toEqual([DEMO_WARD_IDS.general, DEMO_WARD_IDS.icu]);
  });

  it('the ICU roster can be scheduled with no hard violations under its own demand', () => {
    const [, icu] = createDemoWards();
    const rules = rulesForWard(DEFAULT_RULES, icu);
    const nurses = createDemoIcuNurses().map((u) => ({ id: u.id, name: u.displayName, level: u.level, allowedShifts: u.allowedShifts }));
    const res = solveSchedule({ days: buildDays('2026-12-07', [18]), nurses, rules, seed: 7, timeLimitMs: 20_000 });
    expect(res.evaluation.errorCount).toBe(0);
  });
});

describe('migration of single-ward data', () => {
  const user = (id: string, role: UserProfile['role'], wardIds: string[] = []) => ({ id, role, wardIds }) as UserProfile;

  it('finds only documents without a ward and never assigns developers', () => {
    const legacy = findLegacy({
      schedules: [{ id: '2026-12-07', wardId: '' }, { id: 'w1_2027-01-04', wardId: 'w1' }] as Schedule[],
      users: [user('dev', 'developer'), user('head', 'head_nurse'), user('n1', 'nurse'), user('n2', 'nurse', ['w1'])],
      swaps: [{ id: 's1', wardId: '' }, { id: 's2', wardId: 'w1' }] as SwapRequest[],
      leaves: [{ id: 'l1', wardId: 'w1' }, { id: 'l2', wardId: '' }] as LeaveRequest[],
    });
    expect(legacy.schedules.map((s) => s.id)).toEqual(['2026-12-07']);
    expect(legacy.users.map((u) => u.id)).toEqual(['head', 'n1']);
    expect(legacy.swaps.map((s) => s.id)).toEqual(['s1']);
    expect(legacy.leaves.map((l) => l.id)).toEqual(['l2']);
    expect(legacyCount(legacy)).toBe(5);
  });
});
