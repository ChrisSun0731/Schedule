import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  FieldPath,
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { renderSwapRequestEmail, renderSwapResultEmail } from '@/services/emailTemplates';
import type { Schedule, SwapRequest, SwapStatus } from '@/types/schedule';
import { checkSwap, swapBlockedReason, swapCells } from '@/utils/scheduleHelpers';
import { useAuthStore } from '@/stores/auth';
import { useMailQueueStore } from '@/stores/mailQueue';
import { normalizeSchedule, useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useWardsStore } from '@/stores/wards';

/** The ward is taken from the schedule. */
export type NewSwap = Omit<SwapRequest, 'id' | 'wardId' | 'status' | 'warnings' | 'createdAt' | 'updatedAt' | 'emailStatus'>;

function normalizeSwap(id: string, d: DocumentData): SwapRequest {
  return { ...(d as SwapRequest), id, wardId: d.wardId ?? '', warnings: d.warnings ?? [], note: d.note ?? '' };
}

/**
 * Which requests to listen to. Everyone gets the ones they file or are asked about;
 * developers additionally see every request, head nurses those of the wards they manage.
 */
export type SwapScope = { kind: 'all' } | { kind: 'wards'; managed: string[] };

export const useSwapsStore = defineStore('swaps', () => {
  /** Snapshot per listener, merged into `list`. */
  const parts = ref<Record<string, SwapRequest[]>>({});
  const loaded = ref(false);
  let unsubs: Unsubscribe[] = [];

  function start(me: string, scope: SwapScope): void {
    stop();
    const col = collection(db(), 'swap_requests');
    const listen = (key: string, q: Query<DocumentData>) =>
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            parts.value = { ...parts.value, [key]: snap.docs.map((d) => normalizeSwap(d.id, d.data())) };
            loaded.value = true;
          },
          () => (loaded.value = true),
        ),
      );
    if (scope.kind === 'all') {
      listen('all', col);
      return;
    }
    listen('requester', query(col, where('requesterId', '==', me)));
    listen('target', query(col, where('targetId', '==', me)));
    for (const w of new Set(scope.managed)) listen(`w:${w}`, query(col, where('wardId', '==', w)));
  }

  function stop(): void {
    unsubs.forEach((u) => u());
    unsubs = [];
    parts.value = {};
    loaded.value = false;
  }

  const list = computed(() => {
    const byId = new Map<string, SwapRequest>();
    for (const part of Object.values(parts.value)) for (const s of part) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  });

  const isPending = (s: SwapRequest) => s.status === 'pending_target' || s.status === 'pending_head';

  const incoming = computed(() => {
    const me = useAuthStore().email;
    return list.value.filter((s) => s.targetId === me && s.status === 'pending_target');
  });
  const outgoing = computed(() => {
    const me = useAuthStore().email;
    return list.value.filter((s) => s.requesterId === me);
  });
  /** Waiting for a head nurse of a ward the signed-in user manages. */
  const review = computed(() => {
    const wards = useWardsStore();
    return list.value.filter((s) => s.status === 'pending_head' && wards.canManage(s.wardId));
  });
  const badge = computed(() => incoming.value.length + review.value.length);

  // -------------------------------------------------------------------------

  function wardName(swap: Pick<SwapRequest, 'wardId'>): string {
    return useWardsStore().nameOf(swap.wardId);
  }

  async function sendResult(swap: SwapRequest, status: SwapStatus, schedule: Schedule, to: ('requester' | 'target')[]): Promise<void> {
    const mail = useMailQueueStore();
    const settings = useSettingsStore();
    const cells = swapCells(schedule, swap);
    for (const who of to) {
      const recipientName = who === 'requester' ? swap.requesterName : swap.targetName;
      const rendered = renderSwapResultEmail({
        wardName: wardName(swap),
        swap,
        status,
        recipientName,
        cells,
        portalUrl: settings.portalUrl,
      });
      void mail.sendOne({
        ...rendered,
        to: who === 'requester' ? swap.requesterEmail : swap.targetEmail,
        toName: recipientName,
        type: 'swap_result',
        scheduleId: swap.scheduleId,
        swapId: swap.id,
      });
    }
  }

  /** File a swap request and e-mail the target nurse for consent. */
  async function create(input: NewSwap, schedule: Schedule): Promise<SwapRequest> {
    const blocked = swapBlockedReason(schedule, input);
    if (blocked) throw new Error(blocked);
    if (input.scheduleId !== schedule.id) throw new Error('班表不符');
    const now = Date.now();
    const data = {
      ...input,
      wardId: schedule.wardId,
      status: 'pending_target' as const,
      warnings: [],
      emailStatus: null,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(collection(db(), 'swap_requests'), data);
    const swap: SwapRequest = { ...data, id: ref.id };

    const settings = useSettingsStore();
    const rendered = renderSwapRequestEmail({
      wardName: wardName(swap),
      swap,
      cells: swapCells(schedule, swap),
      portalUrl: settings.portalUrl,
    });
    void useMailQueueStore()
      .sendOne({ ...rendered, to: swap.targetEmail, toName: swap.targetName, type: 'swap_request', scheduleId: swap.scheduleId, swapId: swap.id })
      .then((job) =>
        updateDoc(ref, { emailStatus: job.status === 'sent' ? 'sent' : 'failed', updatedAt: Date.now() }).catch(() => undefined),
      );
    return swap;
  }

  async function cancel(swap: SwapRequest): Promise<void> {
    await updateDoc(doc(db(), 'swap_requests', swap.id), { status: 'cancelled', updatedAt: Date.now() });
  }

  /**
   * Swap the cells and change the request status atomically.
   * firestore.rules re-verifies the exact cells for staff nurses.
   */
  async function applyInTransaction(swap: SwapRequest, actor: string, patch: Record<string, unknown>): Promise<Schedule> {
    const sRef = doc(db(), 'schedules', swap.scheduleId);
    const wRef = doc(db(), 'swap_requests', swap.id);
    return runTransaction(db(), async (tx) => {
      const sSnap = await tx.get(sRef);
      const wSnap = await tx.get(wRef);
      if (!sSnap.exists() || !wSnap.exists()) throw new Error('資料不存在');
      const current = normalizeSwap(wSnap.id, wSnap.data());
      if (!isPending(current)) throw new Error('此換班申請已處理');
      const schedule = normalizeSchedule(sSnap.id, sSnap.data());
      const blocked = swapBlockedReason(schedule, current);
      if (blocked) throw new Error(blocked);

      const a = [...schedule.assignments[current.requesterId]!];
      const b = [...schedule.assignments[current.targetId]!];
      for (const d of new Set([current.requesterDay, current.targetDay])) {
        const tmp = a[d]!;
        a[d] = b[d]!;
        b[d] = tmp;
      }
      const now = Date.now();
      tx.update(
        sRef,
        new FieldPath('assignments', current.requesterId), a,
        new FieldPath('assignments', current.targetId), b,
        'lastSwapId', current.id,
        'updatedAt', now,
        'updatedBy', actor,
      );
      tx.update(wRef, { ...patch, status: 'approved', updatedAt: now });
      return schedule;
    });
  }

  /**
   * Target nurse answers. Approval is applied immediately unless the swap breaks a rule
   * (or the ward requires head-nurse approval), in which case it is escalated.
   */
  async function respond(swap: SwapRequest, approve: boolean, note: string): Promise<SwapStatus> {
    const auth = useAuthStore();
    const schedules = useSchedulesStore();
    const wards = useWardsStore();
    const ref = doc(db(), 'swap_requests', swap.id);
    const schedule = schedules.list.find((s) => s.id === swap.scheduleId);
    if (!schedule) throw new Error('找不到班表');
    const now = Date.now();

    if (!approve) {
      await updateDoc(ref, { status: 'rejected', responseNote: note, respondedAt: now, updatedAt: now });
      await sendResult({ ...swap, responseNote: note }, 'rejected', schedule, ['requester']);
      return 'rejected';
    }

    const check = checkSwap(schedule, swap, wards.rulesFor(schedule.wardId), schedules.previousOf(schedule));
    if (check.blocked) throw new Error(check.blocked);
    if (check.introduced.length || wards.requiresHeadApproval(schedule.wardId)) {
      const warnings = check.introduced.map((v) => v.message);
      await updateDoc(ref, { status: 'pending_head', warnings, responseNote: note, respondedAt: now, updatedAt: now });
      await sendResult({ ...swap, warnings, responseNote: note }, 'pending_head', schedule, ['requester']);
      return 'pending_head';
    }

    await applyInTransaction(swap, auth.email, { warnings: [], responseNote: note, respondedAt: now });
    await sendResult({ ...swap, responseNote: note }, 'approved', schedule, ['requester']);
    return 'approved';
  }

  /** Head nurse / developer decision (works for pending_target and pending_head). */
  async function decide(swap: SwapRequest, approve: boolean, note: string): Promise<SwapStatus> {
    const auth = useAuthStore();
    const schedule = useSchedulesStore().list.find((s) => s.id === swap.scheduleId);
    if (!schedule) throw new Error('找不到班表');
    const now = Date.now();
    const patch = { responseNote: note, decidedBy: auth.email, decidedAt: now };
    if (!approve) {
      await updateDoc(doc(db(), 'swap_requests', swap.id), { ...patch, status: 'rejected', updatedAt: now });
      await sendResult({ ...swap, responseNote: note }, 'rejected', schedule, ['requester', 'target']);
      return 'rejected';
    }
    await applyInTransaction(swap, auth.email, patch);
    await sendResult({ ...swap, responseNote: note }, 'approved', schedule, ['requester', 'target']);
    return 'approved';
  }

  return { list, loaded, incoming, outgoing, review, badge, start, stop, create, cancel, respond, decide };
});
