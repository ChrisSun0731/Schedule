import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { createDemoHeadNurse, createDemoIcuNurses, createDemoNurses, createDemoWards } from '@/services/demoData';
import { NURSE_LEVELS, USER_ROLES, WORK_SHIFTS, type NurseLevel, type UserProfile, type UserRole, type WorkShift } from '@/types/schedule';

export function normalizeUser(id: string, data: DocumentData): UserProfile {
  const role: UserRole = USER_ROLES.includes(data.role) ? data.role : 'nurse';
  const level: NurseLevel = NURSE_LEVELS.includes(data.level) ? data.level : 'N0';
  const allowed = Array.isArray(data.allowedShifts)
    ? (data.allowedShifts as string[]).filter((s): s is WorkShift => (WORK_SHIFTS as readonly string[]).includes(s))
    : [...WORK_SHIFTS];
  return {
    id,
    email: String(data.email ?? id),
    displayName: String(data.displayName ?? id),
    employeeId: String(data.employeeId ?? ''),
    role,
    wardIds: Array.isArray(data.wardIds) ? (data.wardIds as unknown[]).filter((w): w is string => typeof w === 'string' && !!w) : [],
    level,
    allowedShifts: allowed.length ? allowed : [...WORK_SHIFTS],
    schedulable: data.schedulable !== false,
    active: data.active !== false,
    uid: data.uid ?? null,
    photoURL: data.photoURL ?? null,
    lastLoginAt: data.lastLoginAt ?? null,
    createdAt: data.createdAt ?? 0,
    updatedAt: data.updatedAt ?? 0,
  };
}

const LEVEL_RANK: Record<NurseLevel, number> = { N3: 0, N2: 1, N1: 2, N0: 3 };

export function compareNurses(a: UserProfile, b: UserProfile): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.employeeId.localeCompare(b.employeeId) || a.displayName.localeCompare(b.displayName);
}

export const useUsersStore = defineStore('users', () => {
  const list = ref<UserProfile[]>([]);
  const loaded = ref(false);
  let unsub: Unsubscribe | null = null;

  function start(): void {
    stop();
    unsub = onSnapshot(collection(db(), 'users'), (snap) => {
      list.value = snap.docs.map((d) => normalizeUser(d.id, d.data())).sort(compareNurses);
      loaded.value = true;
    });
  }

  function stop(): void {
    unsub?.();
    unsub = null;
    list.value = [];
    loaded.value = false;
  }

  const byId = computed(() => new Map(list.value.map((u) => [u.id, u])));
  const schedulable = computed(() => list.value.filter((u) => u.active && u.schedulable));

  /** Active, schedulable staff on a ward's roster (rows of its new schedules). */
  function rosterOf(wardId: string | null | undefined): UserProfile[] {
    if (!wardId) return [];
    return schedulable.value.filter((u) => u.wardIds.includes(wardId));
  }

  /** Head nurses assigned to a ward. */
  function headsOf(wardId: string): UserProfile[] {
    return list.value.filter((u) => u.role === 'head_nurse' && u.active && u.wardIds.includes(wardId));
  }

  async function save(input: UserProfile): Promise<void> {
    const id = input.email.trim().toLowerCase();
    const existing = byId.value.get(id);
    const now = Date.now();
    const data: UserProfile = {
      ...input,
      id,
      email: id,
      displayName: input.displayName.trim(),
      employeeId: input.employeeId.trim(),
      uid: existing?.uid ?? null,
      photoURL: existing?.photoURL ?? null,
      lastLoginAt: existing?.lastLoginAt ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await setDoc(doc(db(), 'users', id), data);
  }

  async function remove(id: string): Promise<void> {
    await deleteDoc(doc(db(), 'users', id));
  }

  /**
   * Adds two demo wards (5A, ICU), 46 fictional nurses on them and a head nurse managing both.
   * Skips wards and e-mails that already exist. `wardExists` comes from the wards store.
   */
  async function importDemo(wardExists: (id: string) => boolean, by: string): Promise<number> {
    const batch = writeBatch(db());
    let added = 0;
    for (const w of createDemoWards(by)) {
      if (!wardExists(w.id)) batch.set(doc(db(), 'wards', w.id), w);
    }
    for (const u of [createDemoHeadNurse(), ...createDemoNurses(), ...createDemoIcuNurses()]) {
      if (byId.value.has(u.id)) continue;
      batch.set(doc(db(), 'users', u.id), u);
      added++;
    }
    await batch.commit();
    return added;
  }

  return { list, loaded, byId, schedulable, rosterOf, headsOf, start, stop, save, remove, importDemo };
});
