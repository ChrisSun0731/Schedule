import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  FieldPath,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { NurseSnapshot, Schedule, ShiftCode, UserProfile } from '@/types/schedule';
import { PERIOD_DAYS } from '@/types/schedule';
import { addDays, holidayIndexesFor, nextMonday, periodEnd, todayISO } from '@/utils/dates';
import { emptyRow } from '@/utils/scheduleHelpers';
import { scheduleIdOf } from '@/utils/wards';
import { useWardsStore } from '@/stores/wards';

export function normalizeSchedule(id: string, data: DocumentData): Schedule {
  return {
    id,
    wardId: typeof data.wardId === 'string' ? data.wardId : '',
    startDate: data.startDate ?? id,
    endDate: data.endDate ?? periodEnd(id),
    status: data.status === 'published' ? 'published' : 'draft',
    nurseOrder: data.nurseOrder ?? [],
    nurses: data.nurses ?? {},
    assignments: data.assignments ?? {},
    locks: data.locks ?? {},
    holidays: data.holidays ?? [],
    lastSwapId: data.lastSwapId ?? null,
    createdAt: data.createdAt ?? 0,
    createdBy: data.createdBy ?? '',
    updatedAt: data.updatedAt ?? 0,
    updatedBy: data.updatedBy ?? '',
    generatedAt: data.generatedAt ?? null,
    publishedAt: data.publishedAt ?? null,
    publishedBy: data.publishedBy ?? null,
  };
}

export function snapshotOf(u: UserProfile): NurseSnapshot {
  return {
    id: u.id,
    name: u.displayName,
    employeeId: u.employeeId,
    level: u.level,
    email: u.email,
    allowedShifts: u.allowedShifts,
  };
}

const SELECTED_KEY = 'nursing-schedule:selected-by-ward';

function readSelected(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTED_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Which schedules to listen to (Firestore rules only allow queries they can prove). */
export type ScheduleScope =
  /** Developers: every ward, drafts included (also finds pre-ward schedules to migrate). */
  | { kind: 'all' }
  /** Head nurses: drafts and published of `managed`, published of `member`. */
  | { kind: 'wards'; managed: string[]; member: string[] };

export const useSchedulesStore = defineStore('schedules', () => {
  /** Snapshot per listener, merged into `list`. */
  const parts = ref<Record<string, Schedule[]>>({});
  const pending = ref(0);
  /** Selected period per ward. */
  const selectedByWard = ref<Record<string, string>>(readSelected());
  let unsubs: Unsubscribe[] = [];

  /** Every schedule the user can see, newest first. */
  const list = computed(() => {
    const byId = new Map<string, Schedule>();
    for (const part of Object.values(parts.value)) for (const s of part) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.wardId.localeCompare(b.wardId));
  });
  const loaded = computed(() => pending.value === 0);

  function start(scope: ScheduleScope): void {
    stop();
    const col = collection(db(), 'schedules');
    const listen = (key: string, q: Query<DocumentData>) => {
      pending.value++;
      let first = true;
      const settle = () => {
        if (!first) return;
        first = false;
        pending.value--;
      };
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            parts.value = { ...parts.value, [key]: snap.docs.map((d) => normalizeSchedule(d.id, d.data())) };
            settle();
          },
          // e.g. a head nurse whose ward was just unassigned – show what is left instead of spinning.
          settle,
        ),
      );
    };
    if (scope.kind === 'all') {
      listen('all', col);
      return;
    }
    const managed = new Set(scope.managed);
    for (const w of managed) listen(`m:${w}`, query(col, where('wardId', '==', w)));
    for (const w of new Set(scope.member)) {
      if (!managed.has(w)) listen(`p:${w}`, query(col, where('wardId', '==', w), where('status', '==', 'published')));
    }
  }

  function stop(): void {
    unsubs.forEach((u) => u());
    unsubs = [];
    parts.value = {};
    pending.value = 0;
  }

  /** Schedules of one ward, newest first. */
  function ofWard(wardId: string | null | undefined): Schedule[] {
    return wardId ? list.value.filter((s) => s.wardId === wardId) : [];
  }

  const wardList = computed(() => ofWard(useWardsStore().current?.id));

  /** The period running today, else the next one, else the latest. */
  function defaultFor(wardId: string | null | undefined): Schedule | null {
    const items = ofWard(wardId);
    const today = todayISO();
    return (
      items.find((s) => s.startDate <= today && today <= s.endDate) ??
      [...items].reverse().find((s) => s.startDate > today) ??
      items[0] ??
      null
    );
  }

  const current = computed<Schedule | null>(() => {
    const wardId = useWardsStore().current?.id;
    if (!wardId) return null;
    const picked = selectedByWard.value[wardId];
    return wardList.value.find((s) => s.id === picked) ?? defaultFor(wardId);
  });
  const selectedId = computed(() => current.value?.id ?? null);

  function select(id: string | null): void {
    const s = id ? list.value.find((x) => x.id === id) : null;
    const wardId = s?.wardId ?? useWardsStore().current?.id;
    if (!wardId) return;
    const next = { ...selectedByWard.value };
    if (s) next[wardId] = s.id;
    else delete next[wardId];
    selectedByWard.value = next;
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  /** The same ward's period that ends the day before `s` starts (for 7-day carry-over). */
  function previousOf(s: Schedule | null): Schedule | null {
    if (!s) return null;
    return list.value.find((x) => x.wardId === s.wardId && addDays(x.endDate, 1) === s.startDate) ?? null;
  }

  /** Suggested start date for a ward's new period: day after its latest period, else next Monday. */
  function suggestedStartFor(wardId: string | null | undefined): string {
    const latest = ofWard(wardId)[0];
    return latest ? addDays(latest.endDate, 1) : nextMonday();
  }

  function ref_(id: string) {
    return doc(db(), 'schedules', id);
  }

  async function create(wardId: string, startDate: string, nurses: UserProfile[], holidayDates: string[], by: string): Promise<string> {
    const now = Date.now();
    const id = scheduleIdOf(wardId, startDate);
    const data: Schedule = {
      id,
      wardId,
      startDate,
      endDate: periodEnd(startDate),
      status: 'draft',
      nurseOrder: nurses.map((n) => n.id),
      nurses: Object.fromEntries(nurses.map((n) => [n.id, snapshotOf(n)])),
      assignments: Object.fromEntries(nurses.map((n) => [n.id, emptyRow()])),
      locks: {},
      holidays: holidayIndexesFor(startDate, holidayDates),
      lastSwapId: null,
      createdAt: now,
      createdBy: by,
      updatedAt: now,
      updatedBy: by,
      generatedAt: null,
      publishedAt: null,
      publishedBy: null,
    };
    await setDoc(ref_(id), data);
    // The listener may not have delivered the new document yet; remember the choice anyway.
    selectedByWard.value = { ...selectedByWard.value, [wardId]: id };
    select(id);
    return id;
  }

  /** Set one cell. Manual edits are locked by default so auto-scheduling keeps them. */
  async function setCell(s: Schedule, nurseId: string, day: number, code: ShiftCode, by: string, lock = true): Promise<void> {
    const row = [...(s.assignments[nurseId] ?? emptyRow())];
    row[day] = code;
    const locks = new Set(s.locks[nurseId] ?? []);
    if (lock) locks.add(day);
    else locks.delete(day);
    await updateDoc(
      ref_(s.id),
      new FieldPath('assignments', nurseId), row,
      new FieldPath('locks', nurseId), [...locks].sort((a, b) => a - b),
      'updatedAt', Date.now(),
      'updatedBy', by,
    );
  }

  async function setLock(s: Schedule, nurseId: string, day: number, locked: boolean, by: string): Promise<void> {
    const locks = new Set(s.locks[nurseId] ?? []);
    if (locked) locks.add(day);
    else locks.delete(day);
    await updateDoc(
      ref_(s.id),
      new FieldPath('locks', nurseId), [...locks].sort((a, b) => a - b),
      'updatedAt', Date.now(),
      'updatedBy', by,
    );
  }

  async function clearLocks(s: Schedule, by: string): Promise<void> {
    await updateDoc(ref_(s.id), { locks: {}, updatedAt: Date.now(), updatedBy: by });
  }

  async function applyGenerated(
    s: Schedule,
    assignments: Record<string, ShiftCode[]>,
    locks: Record<string, number[]>,
    by: string,
  ): Promise<void> {
    const now = Date.now();
    await updateDoc(ref_(s.id), { assignments, locks, generatedAt: now, updatedAt: now, updatedBy: by });
  }

  /** Put back an earlier assignments/locks state (undo, redo). Unlike applyGenerated it keeps generatedAt. */
  async function restore(
    s: Schedule,
    assignments: Record<string, ShiftCode[]>,
    locks: Record<string, number[]>,
    by: string,
  ): Promise<void> {
    await updateDoc(ref_(s.id), { assignments, locks, updatedAt: Date.now(), updatedBy: by });
  }

  async function toggleHoliday(s: Schedule, day: number, by: string): Promise<void> {
    const set = new Set(s.holidays);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    await updateDoc(ref_(s.id), { holidays: [...set].sort((a, b) => a - b), updatedAt: Date.now(), updatedBy: by });
  }

  async function publish(s: Schedule, by: string): Promise<void> {
    const now = Date.now();
    await updateDoc(ref_(s.id), { status: 'published', publishedAt: now, publishedBy: by, updatedAt: now, updatedBy: by });
  }

  async function unpublish(s: Schedule, by: string): Promise<void> {
    await updateDoc(ref_(s.id), { status: 'draft', updatedAt: Date.now(), updatedBy: by });
  }

  async function remove(s: Schedule): Promise<void> {
    await deleteDoc(ref_(s.id));
    if (selectedId.value === s.id) select(null);
  }

  /**
   * Add the ward's schedulable staff missing from the schedule and refresh name/level snapshots.
   * `users` is every known user; only those on `roster` are added as new rows.
   */
  async function syncRoster(s: Schedule, users: UserProfile[], roster: UserProfile[], by: string): Promise<{ added: number }> {
    const onRoster = new Set(roster.map((u) => u.id));
    const nurseOrder = [...s.nurseOrder];
    const nurses = { ...s.nurses };
    const assignments = { ...s.assignments };
    let added = 0;
    for (const u of users) {
      if (nurses[u.id]) {
        nurses[u.id] = snapshotOf(u);
        continue;
      }
      if (!onRoster.has(u.id)) continue;
      nurseOrder.push(u.id);
      nurses[u.id] = snapshotOf(u);
      assignments[u.id] = emptyRow();
      added++;
    }
    await updateDoc(ref_(s.id), { nurseOrder, nurses, assignments, updatedAt: Date.now(), updatedBy: by });
    return { added };
  }

  async function removeRow(s: Schedule, nurseId: string, by: string): Promise<void> {
    const nurses = { ...s.nurses };
    const assignments = { ...s.assignments };
    const locks = { ...s.locks };
    delete nurses[nurseId];
    delete assignments[nurseId];
    delete locks[nurseId];
    await updateDoc(ref_(s.id), {
      nurseOrder: s.nurseOrder.filter((id) => id !== nurseId),
      nurses,
      assignments,
      locks,
      updatedAt: Date.now(),
      updatedBy: by,
    });
  }

  return {
    list,
    wardList,
    loaded,
    selectedId,
    current,
    ofWard,
    defaultFor,
    suggestedStartFor,
    periodDays: PERIOD_DAYS,
    select,
    start,
    stop,
    previousOf,
    create,
    setCell,
    setLock,
    clearLocks,
    applyGenerated,
    restore,
    toggleHoliday,
    publish,
    unpublish,
    remove,
    syncRoster,
    removeRow,
  };
});
