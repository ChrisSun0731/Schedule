/**
 * Pure helpers for wards (病房單位). Each ward has its own staffing demand and senior-nurse
 * requirement; labour rules, shift times and holidays stay hospital-wide in `settings/app`.
 */
import type { DocumentData } from 'firebase/firestore';
import { WARD_RULE_KEYS, type RuleConfig, type StaffingDemand, type Ward, type WardRules } from '@/types/schedule';
import { DEFAULT_RULES } from '@/utils/scheduler';

/** Schedule document id: one 28-day period of one ward. */
export function scheduleIdOf(wardId: string, startDate: string): string {
  return `${wardId}_${startDate}`;
}

function demand(d: Partial<StaffingDemand> | undefined, fallback: StaffingDemand): StaffingDemand {
  const n = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : f);
  return { D: n(d?.D, fallback.D), E: n(d?.E, fallback.E), N: n(d?.N, fallback.N) };
}

/** The ward-level part of a rule set (deep-copied). */
export function wardRulesOf(r: WardRules): WardRules {
  return {
    weekdayDemand: { ...r.weekdayDemand },
    weekendDemand: { ...r.weekendDemand },
    minSeniorPerShift: r.minSeniorPerShift,
    preferredSeniorPerShift: r.preferredSeniorPerShift,
  };
}

export function normalizeWard(id: string, d: DocumentData, defaults: WardRules = DEFAULT_RULES): Ward {
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : f);
  return {
    id,
    name: typeof d.name === 'string' && d.name.trim() ? d.name : id,
    order: typeof d.order === 'number' ? d.order : 0,
    requireHeadApproval: d.requireHeadApproval === true,
    weekdayDemand: demand(d.weekdayDemand, defaults.weekdayDemand),
    weekendDemand: demand(d.weekendDemand, defaults.weekendDemand),
    minSeniorPerShift: num(d.minSeniorPerShift, defaults.minSeniorPerShift),
    preferredSeniorPerShift: num(d.preferredSeniorPerShift, defaults.preferredSeniorPerShift),
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
    updatedBy: d.updatedBy ?? '',
  };
}

/** Hospital-wide rules with the ward's own staffing fields on top. */
export function rulesForWard(base: RuleConfig, ward: WardRules | null | undefined): RuleConfig {
  if (!ward) return base;
  const out: RuleConfig = { ...base };
  for (const k of WARD_RULE_KEYS) Object.assign(out, { [k]: wardRulesOf(ward)[k] });
  return out;
}

export function compareWards(a: Pick<Ward, 'order' | 'name'>, b: Pick<Ward, 'order' | 'name'>): number {
  return a.order - b.order || a.name.localeCompare(b.name, 'zh-Hant');
}

/** e.g. 「平日 D10 E6 N5 · 假日 D8 E6 N5」 */
export function demandSummary(r: WardRules): string {
  const f = (d: StaffingDemand) => `D${d.D} E${d.E} N${d.N}`;
  return `平日 ${f(r.weekdayDemand)} · 假日 ${f(r.weekendDemand)}`;
}
