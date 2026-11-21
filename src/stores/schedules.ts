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
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { NurseSnapshot, Schedule, ShiftCode, UserProfile } from '@/types/schedule';
import { PERIOD_DAYS } from '@/types/schedule';
import { addDays, holidayIndexesFor, nextMonday, periodEnd, todayISO } from '@/utils/dates';
import { emptyRow } from '@/utils/scheduleHelpers';

export function normalizeSchedule(id: string, data: DocumentData): Schedule {
  return {
    id,
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

const SELECTED_KEY = 'nursing-schedule:selected';

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export const useSchedulesStore = defineStore('schedules', () => {
  const list = ref<Schedule[]>([]);
  const loaded = ref(false);
  const selectedId = ref<string | null>(readSelected());
  let unsub: Unsubscribe | null = null;

  function select(id: string | null): void {
    selectedId.value = id;
    try {
      if (id) localStorage.setItem(SELECTED_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }

  function defaultSelection(): string | null {
    const today = todayISO();
    const current = list.value.find((s) => s.startDate <= today && today <= s.endDate);
    if (current) return current.id;
    const upcoming = [...list.value].reverse().find((s) => s.startDate > today);
    return upcoming?.id ?? list.value[0]?.id ?? null;
  }

  function start(isManager: boolean): void {
    stop();
    const ref = isManager
      ? collection(db(), 'schedules')
      : query(collection(db(), 'schedules'), where('status', '==', 'published'));
    unsub = onSnapshot(ref, (snap) => {
      list.value = snap.docs
        .map((d) => normalizeSchedule(d.id, d.data()))
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      loaded.value = true;
      if (!selectedId.value || !list.value.some((s) => s.id === selectedId.value)) select(defaultSelection());
    });
  }

  function stop(): void {
    unsub?.();
    unsub = null;
    list.value = [];
    loaded.value = false;
  }

  const current = computed(() => list.value.find((s) => s.id === selectedId.value) ?? null);

  function previousOf(s: Schedule | null): Schedule | null {
    if (!s) return null;
    return list.value.find((x) => addDays(x.endDate, 1) === s.startDate) ?? null;
  }

  /** Suggested start date for a new period: day after the latest period, else next Monday. */
  const suggestedStart = computed(() => {
    const latest = list.value[0];
    return latest ? addDays(latest.endDate, 1) : nextMonday();
  });

  function ref_(id: string) {
    return doc(db(), 'schedules', id);
  }

  async function create(startDate: string, nurses: UserProfile[], holidayDates: string[], by: string): Promise<string> {
    const now = Date.now();
    const data: Schedule = {
      id: startDate,
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
    await setDoc(ref_(startDate), data);
    select(startDate);
    return startDate;
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

  /** Add schedulable staff missing from the schedule and refresh name/level snapshots. */
  async function syncRoster(s: Schedule, users: UserProfile[], by: string): Promise<{ added: number }> {
    const nurseOrder = [...s.nurseOrder];
    const nurses = { ...s.nurses };
    const assignments = { ...s.assignments };
    let added = 0;
    for (const u of users) {
      if (nurses[u.id]) {
        nurses[u.id] = snapshotOf(u);
        continue;
      }
      if (!u.active || !u.schedulable) continue;
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
    loaded,
    selectedId,
    current,
    suggestedStart,
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
    toggleHoliday,
    publish,
    unpublish,
    remove,
    syncRoster,
    removeRow,
  };
});
