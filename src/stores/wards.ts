import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { RuleConfig, Ward, WardRules } from '@/types/schedule';
import { compareWards, normalizeWard, rulesForWard, wardRulesOf } from '@/utils/wards';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';

const CURRENT_KEY = 'nursing-schedule:ward';

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

/** Fields a head nurse may change on the wards they manage (enforced by firestore.rules). */
export type WardPolicy = WardRules & Pick<Ward, 'requireHeadApproval'>;

export const useWardsStore = defineStore('wards', () => {
  const list = ref<Ward[]>([]);
  const loaded = ref(false);
  const currentId = ref<string | null>(readCurrent());
  let unsub: Unsubscribe | null = null;

  function start(): void {
    stop();
    unsub = onSnapshot(collection(db(), 'wards'), (snap) => {
      list.value = snap.docs.map((d) => normalizeWard(d.id, d.data())).sort(compareWards);
      loaded.value = true;
    });
  }

  function stop(): void {
    unsub?.();
    unsub = null;
    list.value = [];
    loaded.value = false;
  }

  const byId = computed(() => new Map(list.value.map((w) => [w.id, w])));

  /** Wards the signed-in user works in: every ward for developers, their assigned ones otherwise. */
  const mine = computed<Ward[]>(() => {
    const auth = useAuthStore();
    if (auth.isDeveloper) return list.value;
    const ids = new Set(auth.profile?.wardIds ?? []);
    return list.value.filter((w) => ids.has(w.id));
  });

  /** May the signed-in user schedule, publish and approve requests for this ward? */
  function canManage(wardId: string | null | undefined): boolean {
    const auth = useAuthStore();
    if (auth.isDeveloper) return true;
    return auth.role === 'head_nurse' && !!wardId && (auth.profile?.wardIds ?? []).includes(wardId);
  }

  /** The ward the schedule page is showing (remembered per browser). */
  const current = computed<Ward | null>(() => mine.value.find((w) => w.id === currentId.value) ?? mine.value[0] ?? null);

  function select(id: string): void {
    currentId.value = id;
    try {
      localStorage.setItem(CURRENT_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }

  function nameOf(id: string | null | undefined): string {
    if (!id) return '未分配病房';
    return byId.value.get(id)?.name ?? '已刪除的病房';
  }

  /** Rules used to check a schedule of this ward. */
  function rulesFor(wardId: string | null | undefined): RuleConfig {
    return rulesForWard(useSettingsStore().rules, wardId ? byId.value.get(wardId) : null);
  }

  function requiresHeadApproval(wardId: string | null | undefined): boolean {
    return !!wardId && byId.value.get(wardId)?.requireHeadApproval === true;
  }

  /** Developers only. New wards start from the hospital-wide default demand. */
  async function create(name: string, by: string, opts: { rules?: WardRules; requireHeadApproval?: boolean } = {}): Promise<string> {
    const ref = doc(collection(db(), 'wards'));
    const now = Date.now();
    const data: Ward = {
      id: ref.id,
      name: name.trim(),
      order: list.value.reduce((m, w) => Math.max(m, w.order), 0) + 1,
      requireHeadApproval: opts.requireHeadApproval ?? false,
      ...wardRulesOf(opts.rules ?? useSettingsStore().settings),
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
    };
    await setDoc(ref, data);
    return ref.id;
  }

  /** Head nurses (for their wards) and developers. */
  async function savePolicy(id: string, policy: WardPolicy, by: string): Promise<void> {
    await updateDoc(doc(db(), 'wards', id), {
      ...wardRulesOf(policy),
      requireHeadApproval: policy.requireHeadApproval,
      updatedAt: Date.now(),
      updatedBy: by,
    });
  }

  /** Developers only. */
  async function rename(id: string, name: string, by: string): Promise<void> {
    await updateDoc(doc(db(), 'wards', id), { name: name.trim(), updatedAt: Date.now(), updatedBy: by });
  }

  /** Developers only; the page checks the ward has no schedules or staff first. */
  async function remove(id: string): Promise<void> {
    await deleteDoc(doc(db(), 'wards', id));
  }

  return {
    list,
    loaded,
    byId,
    mine,
    current,
    currentId,
    start,
    stop,
    canManage,
    select,
    nameOf,
    rulesFor,
    requiresHeadApproval,
    create,
    savePolicy,
    rename,
    remove,
  };
});
