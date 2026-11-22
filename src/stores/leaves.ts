import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/types/schedule';
import { useAuthStore } from '@/stores/auth';
import { useWardsStore } from '@/stores/wards';

export interface NewLeave {
  /** The nurse's ward; its head nurse decides. */
  wardId: string;
  nurseId: string;
  nurseName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  note: string;
}

/** Developers see every request; others their own plus those of the wards they manage. */
export type LeaveScope = { kind: 'all' } | { kind: 'wards'; managed: string[] };

export const useLeavesStore = defineStore('leaves', () => {
  /** Snapshot per listener, merged into `list`. */
  const parts = ref<Record<string, LeaveRequest[]>>({});
  const loaded = ref(false);
  let unsubs: Unsubscribe[] = [];

  function start(me: string, scope: LeaveScope): void {
    stop();
    const col = collection(db(), 'leave_requests');
    const listen = (key: string, q: Query<DocumentData>) =>
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            parts.value = {
              ...parts.value,
              [key]: snap.docs.map((d) => ({ ...(d.data() as LeaveRequest), id: d.id, wardId: d.data().wardId ?? '' })),
            };
            loaded.value = true;
          },
          () => (loaded.value = true),
        ),
      );
    if (scope.kind === 'all') {
      listen('all', col);
      return;
    }
    listen('mine', query(col, where('nurseId', '==', me)));
    for (const w of new Set(scope.managed)) listen(`w:${w}`, query(col, where('wardId', '==', w)));
  }

  function stop(): void {
    unsubs.forEach((u) => u());
    unsubs = [];
    parts.value = {};
    loaded.value = false;
  }

  const list = computed(() => {
    const byId = new Map<string, LeaveRequest>();
    for (const part of Object.values(parts.value)) for (const l of part) byId.set(l.id, l);
    return [...byId.values()].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);
  });

  const mine = computed(() => list.value.filter((l) => l.nurseId === useAuthStore().email));
  /** Waiting for a decision by the signed-in user (wards they manage). */
  const pending = computed(() => {
    const wards = useWardsStore();
    return list.value.filter((l) => l.status === 'pending' && wards.canManage(l.wardId));
  });

  /** Approved leave overlapping [start, end] (optionally only these nurses). */
  function approvedBetween(start: string, end: string, nurseIds?: Iterable<string>): LeaveRequest[] {
    const only = nurseIds ? new Set(nurseIds) : null;
    return list.value.filter(
      (l) => l.status === 'approved' && l.startDate <= end && l.endDate >= start && (!only || only.has(l.nurseId)),
    );
  }

  /** Nurses file pending requests; managers may enter approved leave directly. */
  async function create(input: NewLeave, approved = false): Promise<void> {
    const auth = useAuthStore();
    const now = Date.now();
    await addDoc(collection(db(), 'leave_requests'), {
      ...input,
      status: approved ? 'approved' : 'pending',
      createdAt: now,
      updatedAt: now,
      decidedBy: approved ? auth.email : null,
      decidedAt: approved ? now : null,
    });
  }

  async function decide(leave: LeaveRequest, status: Extract<LeaveStatus, 'approved' | 'rejected'>): Promise<void> {
    const auth = useAuthStore();
    const now = Date.now();
    await updateDoc(doc(db(), 'leave_requests', leave.id), { status, decidedBy: auth.email, decidedAt: now, updatedAt: now });
  }

  async function cancel(leave: LeaveRequest): Promise<void> {
    await updateDoc(doc(db(), 'leave_requests', leave.id), { status: 'cancelled', updatedAt: Date.now() });
  }

  async function remove(leave: LeaveRequest): Promise<void> {
    await deleteDoc(doc(db(), 'leave_requests', leave.id));
  }

  return { list, loaded, mine, pending, start, stop, approvedBetween, create, decide, cancel, remove };
});
