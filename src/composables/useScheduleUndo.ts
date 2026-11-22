import { computed, ref, watch, type Ref } from 'vue';
import { Notify } from 'quasar';
import { useSchedulesStore } from '@/stores/schedules';
import type { Schedule, ShiftCode } from '@/types/schedule';

export interface CellState {
  code: ShiftCode;
  locked: boolean;
}

export interface Snapshot {
  assignments: Record<string, ShiftCode[]>;
  locks: Record<string, number[]>;
}

export type UndoEntry =
  | { kind: 'cell'; label: string; nurseId: string; day: number; before: CellState; after: CellState }
  | { kind: 'bulk'; label: string; before: Snapshot; after: Snapshot };

const LIMIT = 100;

export function cellState(s: Schedule, nurseId: string, day: number): CellState {
  return { code: s.assignments[nurseId]?.[day] ?? 'OFF', locked: (s.locks?.[nurseId] ?? []).includes(day) };
}

export function snapshotOf(s: Schedule): Snapshot {
  return JSON.parse(JSON.stringify({ assignments: s.assignments, locks: s.locks ?? {} })) as Snapshot;
}

/** Order-insensitive comparison (Firestore does not keep map key order). Missing lock rows equal []. */
function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  const same = (x: Record<string, unknown[]>, y: Record<string, unknown[]>) => {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const p = x[k] ?? [];
      const q = y[k] ?? [];
      if (p.length !== q.length || p.some((v, i) => v !== q[i])) return false;
    }
    return true;
  };
  return same(a.assignments, b.assignments) && same(a.locks, b.locks);
}

/**
 * Undo / redo for roster edits made in this session.
 *
 * Every write goes straight to Firestore, so an undo is a new write. Before writing, the entry is
 * checked against the live schedule: if someone else changed the cell since, the entry is dropped
 * instead of silently overwriting their work.
 */
export function useScheduleUndo(
  current: Ref<Schedule | null>,
  by: () => string,
  reveal: (entry: UndoEntry) => void,
) {
  const store = useSchedulesStore();
  const undoStack = ref<UndoEntry[]>([]);
  const redoStack = ref<UndoEntry[]>([]);
  const busy = ref(false);

  watch(
    () => current.value?.id,
    () => {
      undoStack.value = [];
      redoStack.value = [];
    },
  );

  function push(entry: UndoEntry): void {
    undoStack.value = [...undoStack.value.slice(-(LIMIT - 1)), entry];
    redoStack.value = [];
  }

  /** Write one cell (shift and/or lock) and record it. No-op when nothing changes. */
  async function setCell(nurseId: string, day: number, after: CellState, label: string): Promise<void> {
    const s = current.value;
    if (!s) return;
    const before = cellState(s, nurseId, day);
    if (before.code === after.code && before.locked === after.locked) return;
    await store.setCell(s, nurseId, day, after.code, by(), after.locked);
    push({ kind: 'cell', label, nurseId, day, before, after });
  }

  /** Record a whole-schedule change that has already been written (auto-schedule, clear locks). */
  function recordBulk(label: string, before: Snapshot, after: Snapshot): void {
    push({ kind: 'bulk', label, before, after });
  }

  function isLive(s: Schedule, entry: UndoEntry, expected: 'before' | 'after'): boolean {
    if (entry.kind === 'cell') {
      const now = cellState(s, entry.nurseId, entry.day);
      const want = entry[expected];
      return now.code === want.code && now.locked === want.locked;
    }
    return sameSnapshot(snapshotOf(s), entry[expected]);
  }

  async function step(direction: 'undo' | 'redo'): Promise<void> {
    const s = current.value;
    const from = direction === 'undo' ? undoStack : redoStack;
    const to = direction === 'undo' ? redoStack : undoStack;
    const entry = from.value.at(-1);
    if (!s || !entry || busy.value) return;
    from.value = from.value.slice(0, -1);

    const verb = direction === 'undo' ? '復原' : '重做';
    if (!isLive(s, entry, direction === 'undo' ? 'after' : 'before')) {
      Notify.create({ type: 'info', message: `「${entry.label}」之後已有其他人修改，無法${verb}` });
      return;
    }

    busy.value = true;
    try {
      if (entry.kind === 'cell') {
        const target = direction === 'undo' ? entry.before : entry.after;
        await store.setCell(s, entry.nurseId, entry.day, target.code, by(), target.locked);
      } else {
        const target = direction === 'undo' ? entry.before : entry.after;
        await store.restore(s, target.assignments, target.locks, by());
      }
      to.value = [...to.value, entry];
      reveal(entry);
    } catch (err) {
      from.value = [...from.value, entry];
      throw err;
    } finally {
      busy.value = false;
    }
  }

  return {
    busy,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    undoLabel: computed(() => undoStack.value.at(-1)?.label ?? ''),
    redoLabel: computed(() => redoStack.value.at(-1)?.label ?? ''),
    setCell,
    recordBulk,
    undo: () => step('undo'),
    redo: () => step('redo'),
  };
}
