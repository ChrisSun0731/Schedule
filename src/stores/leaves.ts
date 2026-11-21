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
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/types/schedule';
import { useAuthStore } from '@/stores/auth';

export interface NewLeave {
  nurseId: string;
  nurseName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  note: string;
}

export const useLeavesStore = defineStore('leaves', () => {
  const list = ref<LeaveRequest[]>([]);
  const loaded = ref(false);
  let unsub: Unsubscribe | null = null;

  function start(me: string, isManager: boolean): void {
    stop();
    const col = collection(db(), 'leave_requests');
    unsub = onSnapshot(isManager ? col : query(col, where('nurseId', '==', me)), (snap) => {
      list.value = snap.docs
        .map((d) => ({ ...(d.data() as LeaveRequest), id: d.id }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);
      loaded.value = true;
    });
  }

  function stop(): void {
    unsub?.();
    unsub = null;
    list.value = [];
    loaded.value = false;
  }

  const mine = computed(() => list.value.filter((l) => l.nurseId === useAuthStore().email));
  const pending = computed(() => list.value.filter((l) => l.status === 'pending'));

  /** Approved leave overlapping [start, end]. */
  function approvedBetween(start: string, end: string): LeaveRequest[] {
    return list.value.filter((l) => l.status === 'approved' && l.startDate <= end && l.endDate >= start);
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
