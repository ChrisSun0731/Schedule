/**
 * One-time move of single-ward data (from before wards existed) into a ward.
 *
 * - schedules `{startDate}` → `{wardId}_{startDate}` with `wardId` set (copy + delete);
 * - swap requests get `wardId` and the new `scheduleId`;
 * - leave requests get `wardId`;
 * - staff without a ward (except developers) are assigned to it.
 *
 * Runs as a developer (firestore.rules let developers do each step). Writes go in batches of
 * at most 400, so a very large install is not migrated atomically – but every step only touches
 * documents that still lack a ward, so running it again finishes the job.
 */
import { doc, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { LeaveRequest, Schedule, SwapRequest, UserProfile } from '@/types/schedule';
import { scheduleIdOf } from '@/utils/wards';

export interface LegacyData {
  schedules: Schedule[];
  users: UserProfile[];
  swaps: SwapRequest[];
  leaves: LeaveRequest[];
}

export interface MigrationResult {
  schedules: number;
  users: number;
  swaps: number;
  leaves: number;
  /** Schedules not moved because the ward already has a schedule for that start date. */
  skipped: string[];
}

/** Documents that still belong to no ward. Developers are never put on a ward. */
export function findLegacy(all: LegacyData): LegacyData {
  return {
    schedules: all.schedules.filter((s) => !s.wardId),
    users: all.users.filter((u) => u.role !== 'developer' && !u.wardIds.length),
    swaps: all.swaps.filter((s) => !s.wardId),
    leaves: all.leaves.filter((l) => !l.wardId),
  };
}

export function legacyCount(d: LegacyData): number {
  return d.schedules.length + d.users.length + d.swaps.length + d.leaves.length;
}

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function migrateToWard(
  wardId: string,
  legacy: LegacyData,
  existingScheduleIds: ReadonlySet<string>,
  by: string,
): Promise<MigrationResult> {
  const result: MigrationResult = { schedules: 0, users: 0, swaps: 0, leaves: 0, skipped: [] };
  const store = db();
  const batches: WriteBatch[] = [];
  let ops = 400;
  const batch = (n: number): WriteBatch => {
    if (ops + n > 400) {
      batches.push(writeBatch(store));
      ops = 0;
    }
    ops += n;
    return batches[batches.length - 1]!;
  };
  const now = Date.now();

  // Staff first (batches commit in order): if a later batch fails, nurses can already use their ward.
  for (const u of legacy.users) {
    batch(1).update(doc(store, 'users', u.id), { wardIds: [wardId], updatedAt: now });
    result.users++;
  }
  for (const s of legacy.schedules) {
    const id = scheduleIdOf(wardId, s.startDate);
    if (existingScheduleIds.has(id)) {
      result.skipped.push(s.startDate);
      continue;
    }
    const b = batch(2);
    b.set(doc(store, 'schedules', id), { ...s, id, wardId, updatedAt: now, updatedBy: by });
    b.delete(doc(store, 'schedules', s.id));
    result.schedules++;
  }
  for (const s of legacy.swaps) {
    const scheduleId = BARE_DATE.test(s.scheduleId) ? scheduleIdOf(wardId, s.scheduleId) : s.scheduleId;
    batch(1).update(doc(store, 'swap_requests', s.id), { wardId, scheduleId });
    result.swaps++;
  }
  for (const l of legacy.leaves) {
    batch(1).update(doc(store, 'leave_requests', l.id), { wardId });
    result.leaves++;
  }

  for (const b of batches) await b.commit();
  return result;
}
