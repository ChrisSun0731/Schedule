/**
 * Security rules tests – run with `npm run test:rules` (starts the Firestore emulator).
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  FieldPath,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { LEAVE_TYPES } from '@/types/schedule';

const PROJECT = 'demo-nursing-schedule';
const W1 = 'w1';
const W2 = 'w2';
const SID = `${W1}_2026-12-07`;
const DRAFT = `${W1}_2027-01-04`;
const A = 'a@test.com';
const B = 'b@test.com';
const C = 'c@test.com';
/** Nurse on ward 2. */
const D = 'd@test.com';
const DEV = 'dev@test.com';
/** Manages ward 1 only. */
const HEAD = 'head@test.com';
/** Manages ward 2 only. */
const HEAD2 = 'head2@test.com';
const BOOT = 'boot@test.com';

/** `FIRESTORE_EMULATOR_HOST` is set by `firebase emulators:exec` (any port). */
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':') as [string, string];

let env: RulesTestEnvironment;

const rowOf = (week: string) => Array.from({ length: 4 }, () => week.split(' ')).flat();
const ROW_A = rowOf('D D D D D OFF OFF');
const ROW_B = rowOf('N N N N N OFF OFF');
const ROW_C = rowOf('E E E E E OFF OFF');

function user(email: string, role: string, extra: Record<string, unknown> = {}) {
  return {
    id: email,
    email,
    displayName: email.split('@')[0],
    employeeId: email.toUpperCase().slice(0, 3),
    role,
    wardIds: role === 'developer' ? [] : [W1],
    level: 'N2',
    allowedShifts: ['D', 'E', 'N'],
    schedulable: role !== 'developer',
    active: true,
    ...extra,
  };
}

function ward(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Ward ${id}`,
    order: 1,
    weekdayDemand: { D: 2, E: 1, N: 1 },
    weekendDemand: { D: 1, E: 1, N: 1 },
    minSeniorPerShift: 1,
    preferredSeniorPerShift: 2,
    requireHeadApproval: false,
    ...extra,
  };
}

function schedule(wardId: string, startDate: string, status: string) {
  return {
    id: `${wardId}_${startDate}`,
    wardId,
    startDate,
    endDate: startDate,
    status,
    nurseOrder: [A, B, C],
    nurses: {},
    assignments: { [A]: ROW_A, [B]: ROW_B, [C]: ROW_C },
    locks: {},
    holidays: [],
    lastSwapId: null,
    createdAt: 1,
    createdBy: HEAD,
    updatedAt: 1,
    updatedBy: HEAD,
  };
}

const SWAP = {
  scheduleId: SID,
  wardId: W1,
  requesterId: A,
  requesterName: 'a',
  requesterEmployeeId: 'A',
  requesterEmail: A,
  requesterDay: 0,
  requesterDate: SID,
  requesterShift: 'D',
  targetId: B,
  targetName: 'b',
  targetEmployeeId: 'B',
  targetEmail: B,
  targetDay: 2,
  targetDate: '2026-12-09',
  targetShift: 'N',
  note: '',
  status: 'pending_target',
  warnings: [],
  createdAt: 1,
  updatedAt: 1,
};

function db(email: string, verified = true): Firestore {
  return env
    .authenticatedContext(`uid-${email}`, { email, email_verified: verified })
    .firestore() as unknown as Firestore;
}

/** The batch a target nurse writes when approving swap `s1` (optionally tampered). */
function approveBatch(as: string, tamper?: (a: string[], b: string[]) => void) {
  const store = db(as);
  const a = [...ROW_A];
  const b = [...ROW_B];
  for (const d of [0, 2]) [a[d], b[d]] = [b[d]!, a[d]!];
  tamper?.(a, b);
  const batch = writeBatch(store);
  batch.update(
    doc(store, 'schedules', SID),
    new FieldPath('assignments', A), a,
    new FieldPath('assignments', B), b,
    'lastSwapId', 's1',
    'updatedAt', 2,
    'updatedBy', as,
  );
  batch.update(doc(store, 'swap_requests', 's1'), { status: 'approved', respondedAt: 2, updatedAt: 2 });
  return batch.commit();
}

beforeAll(async () => {
  const rules = readFileSync('firestore.rules', 'utf8').replace("'admin@example.com'", `'${BOOT}'`);
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules, host: EMU_HOST, port: Number(EMU_PORT) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(store, 'users', DEV), user(DEV, 'developer'));
    await setDoc(doc(store, 'users', HEAD), user(HEAD, 'head_nurse'));
    await setDoc(doc(store, 'users', HEAD2), user(HEAD2, 'head_nurse', { wardIds: [W2] }));
    for (const e of [A, B, C]) await setDoc(doc(store, 'users', e), user(e, 'nurse'));
    await setDoc(doc(store, 'users', D), user(D, 'nurse', { wardIds: [W2] }));
    await setDoc(doc(store, 'users', 'off@test.com'), user('off@test.com', 'nurse', { active: false }));
    await setDoc(doc(store, 'settings', 'app'), {});
    await setDoc(doc(store, 'wards', W1), ward(W1));
    await setDoc(doc(store, 'wards', W2), ward(W2));
    await setDoc(doc(store, 'schedules', SID), schedule(W1, '2026-12-07', 'published'));
    await setDoc(doc(store, 'schedules', DRAFT), schedule(W1, '2027-01-04', 'draft'));
    await setDoc(doc(store, 'swap_requests', 's1'), SWAP);
  });
});

describe('users', () => {
  it('only registered, active users can read profiles', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'users', B)));
    await assertFails(getDoc(doc(db('stranger@test.com'), 'users', B)));
    await assertFails(getDoc(doc(db('off@test.com'), 'users', B)));
    await assertFails(getDoc(doc(db(A, false), 'users', B)));
    // …but anyone signed in may read their own (possibly missing / disabled) profile.
    await assertSucceeds(getDoc(doc(db('off@test.com'), 'users', 'off@test.com')));
    await assertSucceeds(getDoc(doc(db('stranger@test.com'), 'users', 'stranger@test.com')));
  });

  it('bootstrap e-mail can create its own developer profile; others cannot', async () => {
    await assertSucceeds(setDoc(doc(db(BOOT), 'users', BOOT), user(BOOT, 'developer')));
    await assertFails(setDoc(doc(db('x@test.com'), 'users', 'x@test.com'), user('x@test.com', 'developer')));
    await assertFails(setDoc(doc(db('x@test.com'), 'users', 'x@test.com'), user('x@test.com', 'nurse')));
  });

  it('nurses cannot change roles but may stamp their own login metadata', async () => {
    await assertFails(updateDoc(doc(db(A), 'users', A), { role: 'head_nurse' }));
    await assertFails(setDoc(doc(db(A), 'users', 'new@test.com'), user('new@test.com', 'nurse')));
    await assertSucceeds(updateDoc(doc(db(A), 'users', A), { uid: `uid-${A}`, lastLoginAt: 5, photoURL: null }));
    await assertFails(updateDoc(doc(db(A), 'users', A), { uid: 'someone-else' }));
  });

  it('head nurses cannot manage users; developers can (but not lock themselves out)', async () => {
    await assertFails(setDoc(doc(db(HEAD), 'users', 'new@test.com'), user('new@test.com', 'nurse')));
    await assertSucceeds(setDoc(doc(db(DEV), 'users', 'new@test.com'), user('new@test.com', 'nurse')));
    await assertSucceeds(updateDoc(doc(db(DEV), 'users', A), { level: 'N3' }));
    await assertFails(updateDoc(doc(db(DEV), 'users', DEV), { role: 'nurse' }));
    await assertFails(deleteDoc(doc(db(DEV), 'users', DEV)));
    await assertSucceeds(deleteDoc(doc(db(DEV), 'users', C)));
  });

  it('only developers can write settings', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'settings', 'app')));
    await assertFails(setDoc(doc(db(HEAD), 'settings', 'app'), { minRestHours: 0 }));
    await assertSucceeds(setDoc(doc(db(DEV), 'settings', 'app'), { minRestHours: 0 }));
  });

  it('only developers assign wards', async () => {
    await assertFails(updateDoc(doc(db(HEAD), 'users', D), { wardIds: [W1] }));
    await assertFails(updateDoc(doc(db(A), 'users', A), { wardIds: [W1, W2] }));
    await assertSucceeds(updateDoc(doc(db(DEV), 'users', D), { wardIds: [W1] }));
    await assertFails(updateDoc(doc(db(DEV), 'users', D), { wardIds: 'w1' }));
  });
});

describe('schedules', () => {
  it('nurses read published schedules only', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'schedules', SID)));
    await assertFails(getDoc(doc(db(A), 'schedules', DRAFT)));
    await assertSucceeds(getDocs(query(collection(db(A), 'schedules'), where('status', '==', 'published'))));
    await assertFails(getDocs(collection(db(A), 'schedules')));
    await assertSucceeds(getDoc(doc(db(HEAD), 'schedules', DRAFT)));
  });

  it('nurses cannot edit cells, create or delete schedules', async () => {
    const store = db(A);
    await assertFails(updateDoc(doc(store, 'schedules', SID), new FieldPath('assignments', A), rowOf('OFF OFF OFF OFF OFF OFF OFF')));
    await assertFails(setDoc(doc(store, 'schedules', `${W1}_2027-02-01`), schedule(W1, '2027-02-01', 'draft')));
    await assertFails(deleteDoc(doc(store, 'schedules', DRAFT)));
  });

  it('head nurses edit, publish and delete drafts; only developers delete published', async () => {
    const store = db(HEAD);
    await assertSucceeds(updateDoc(doc(store, 'schedules', SID), new FieldPath('assignments', A), ROW_C));
    await assertSucceeds(updateDoc(doc(store, 'schedules', DRAFT), { status: 'published' }));
    await assertFails(deleteDoc(doc(store, 'schedules', SID)));
    await assertSucceeds(setDoc(doc(store, 'schedules', `${W1}_2027-02-01`), schedule(W1, '2027-02-01', 'draft')));
    await assertSucceeds(deleteDoc(doc(store, 'schedules', `${W1}_2027-02-01`)));
    await assertSucceeds(deleteDoc(doc(db(DEV), 'schedules', SID)));
  });
});

describe('swap approval by the target nurse', () => {
  it('succeeds when exactly the agreed cells are exchanged together with the status change', async () => {
    await assertSucceeds(approveBatch(B));
  });

  it('fails when any other cell is modified', async () => {
    await assertFails(approveBatch(B, (_a, b) => (b[10] = 'OFF')));
    await assertFails(approveBatch(B, (a) => (a[27] = 'N')));
  });

  it('fails when the cells are not actually swapped', async () => {
    await assertFails(approveBatch(B, (a) => (a[0] = 'OFF')));
  });

  it('fails for anyone but the target (requester or third nurse)', async () => {
    await assertFails(approveBatch(A));
    await assertFails(approveBatch(C));
  });

  it('fails when the schedule is not updated in the same batch', async () => {
    await assertFails(updateDoc(doc(db(B), 'swap_requests', 's1'), { status: 'approved', updatedAt: 2 }));
  });

  it('cannot be replayed once approved', async () => {
    await assertSucceeds(approveBatch(B));
    await assertFails(approveBatch(B));
  });

  it("requires head-nurse approval when the swap's ward is configured so", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore() as unknown as Firestore, 'wards', W1), { requireHeadApproval: true });
    });
    await assertFails(approveBatch(B));
    await assertSucceeds(
      updateDoc(doc(db(B), 'swap_requests', 's1'), { status: 'pending_head', warnings: ['x'], respondedAt: 2, updatedAt: 2 }),
    );
  });

  it.each([
    { name: 'first & last day', requesterDay: 0, targetDay: 27 },
    { name: 'same day', requesterDay: 27, targetDay: 27 },
    { name: 'adjacent days', requesterDay: 26, targetDay: 27 },
  ])('handles row edges ($name)', async ({ requesterDay, targetDay }) => {
    // Rows whose first and last days are working days.
    const rowA: string[] = rowOf('D D D D D OFF OFF').map((_, i) => (i % 7 === 3 || i % 7 === 4 ? 'OFF' : 'D'));
    const rowB: string[] = rowA.map((c) => (c === 'D' ? 'N' : c));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const store = ctx.firestore() as unknown as Firestore;
      await updateDoc(doc(store, 'schedules', SID), new FieldPath('assignments', A), rowA, new FieldPath('assignments', B), rowB);
      await setDoc(doc(store, 'swap_requests', 'edge'), {
        ...SWAP,
        requesterDay,
        targetDay,
        requesterShift: rowA[requesterDay],
        targetShift: rowB[targetDay],
      });
    });
    const store = db(B);
    const a = [...rowA];
    const b = [...rowB];
    for (const d of new Set([requesterDay, targetDay])) [a[d], b[d]] = [b[d]!, a[d]!];
    const batch = writeBatch(store);
    batch.update(
      doc(store, 'schedules', SID),
      new FieldPath('assignments', A), a,
      new FieldPath('assignments', B), b,
      'lastSwapId', 'edge',
      'updatedAt', 2,
      'updatedBy', B,
    );
    batch.update(doc(store, 'swap_requests', 'edge'), { status: 'approved', respondedAt: 2, updatedAt: 2 });
    await assertSucceeds(batch.commit());
  });

  it('target may reject; requester may cancel; neither may forge other fields', async () => {
    await assertFails(updateDoc(doc(db(B), 'swap_requests', 's1'), { status: 'rejected', targetDay: 5 }));
    await assertSucceeds(updateDoc(doc(db(B), 'swap_requests', 's1'), { status: 'rejected', respondedAt: 3, updatedAt: 3 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'swap_requests', 's2'), { ...SWAP, id: 's2' });
    });
    await assertFails(updateDoc(doc(db(A), 'swap_requests', 's2'), { status: 'approved', updatedAt: 3 }));
    await assertSucceeds(updateDoc(doc(db(A), 'swap_requests', 's2'), { status: 'cancelled', updatedAt: 3 }));
  });
});

describe('swap requests', () => {
  it('participants and managers can read; others cannot', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'swap_requests', 's1')));
    await assertSucceeds(getDoc(doc(db(B), 'swap_requests', 's1')));
    await assertSucceeds(getDoc(doc(db(HEAD), 'swap_requests', 's1')));
    await assertFails(getDoc(doc(db(C), 'swap_requests', 's1')));
  });

  it('a nurse can only file requests as themselves, on published schedules', async () => {
    await assertSucceeds(addDoc(collection(db(C), 'swap_requests'), { ...SWAP, requesterId: C, requesterEmail: C }));
    await assertFails(addDoc(collection(db(C), 'swap_requests'), { ...SWAP }));
    await assertFails(addDoc(collection(db(C), 'swap_requests'), { ...SWAP, requesterId: C, scheduleId: DRAFT }));
    await assertFails(addDoc(collection(db(C), 'swap_requests'), { ...SWAP, requesterId: C, status: 'approved' }));
    // the ward must be the schedule's
    await assertFails(addDoc(collection(db(C), 'swap_requests'), { ...SWAP, requesterId: C, requesterEmail: C, wardId: W2 }));
  });
});

describe('leave requests', () => {
  it('nurses file pending leave for themselves only; managers decide', async () => {
    const base = { wardId: W1, nurseId: A, nurseName: 'a', type: 'AL', startDate: '2026-12-10', endDate: '2026-12-11', note: '', createdAt: 1, updatedAt: 1 };
    await assertSucceeds(setDoc(doc(db(A), 'leave_requests', 'l1'), { ...base, status: 'pending' }));
    await assertFails(setDoc(doc(db(A), 'leave_requests', 'l2'), { ...base, status: 'approved' }));
    await assertFails(setDoc(doc(db(A), 'leave_requests', 'l3'), { ...base, nurseId: B, status: 'pending' }));
    await assertFails(updateDoc(doc(db(A), 'leave_requests', 'l1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(db(HEAD), 'leave_requests', 'l1'), { status: 'approved', decidedBy: HEAD }));
    await assertFails(getDoc(doc(db(B), 'leave_requests', 'l1')));
    // filed under a ward the nurse is not on
    await assertFails(setDoc(doc(db(A), 'leave_requests', 'l4'), { ...base, wardId: W2, status: 'pending' }));
  });

  it('accepts every leave type and nothing else', async () => {
    const base = { wardId: W1, nurseId: A, nurseName: 'a', startDate: '2026-12-10', endDate: '2026-12-10', note: '', status: 'pending', createdAt: 1, updatedAt: 1 };
    for (const type of LEAVE_TYPES) {
      await assertSucceeds(setDoc(doc(db(A), 'leave_requests', `t-${type}`), { ...base, type }));
    }
    await assertFails(setDoc(doc(db(A), 'leave_requests', 't-D'), { ...base, type: 'D' }));
    await assertFails(setDoc(doc(db(A), 'leave_requests', 't-XX'), { ...base, type: 'XX' }));
  });
});

describe('mail queue & e-mail logs', () => {
  it('nurses may only e-mail the counterpart of their own swap', async () => {
    const mail = { to: B, message: { subject: 's', html: 'h' }, createdBy: A, swapId: 's1' };
    await assertSucceeds(addDoc(collection(db(A), 'mail'), mail));
    await assertFails(addDoc(collection(db(A), 'mail'), { ...mail, to: 'victim@test.com' }));
    await assertFails(addDoc(collection(db(C), 'mail'), { ...mail, createdBy: C }));
    await assertSucceeds(addDoc(collection(db(HEAD), 'mail'), { to: 'any@test.com', message: {}, createdBy: HEAD }));
  });

  it('nurses may log swap e-mails but not schedule broadcasts', async () => {
    const log = { to: B, type: 'swap_request', status: 'queued', sentBy: A };
    await assertSucceeds(addDoc(collection(db(A), 'email_logs'), log));
    await assertFails(addDoc(collection(db(A), 'email_logs'), { ...log, type: 'schedule' }));
    await assertSucceeds(addDoc(collection(db(HEAD), 'email_logs'), { ...log, type: 'schedule', sentBy: HEAD }));
  });
});

describe('wards: each head nurse manages only their own wards', () => {
  it('registered users read wards; only developers create, rename and delete them', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'wards', W1)));
    await assertFails(getDoc(doc(db('stranger@test.com'), 'wards', W1)));
    await assertFails(setDoc(doc(db(HEAD), 'wards', 'w3'), ward('w3')));
    await assertSucceeds(setDoc(doc(db(DEV), 'wards', 'w3'), ward('w3')));
    await assertFails(setDoc(doc(db(DEV), 'wards', 'w4'), ward('w5')));
    await assertFails(setDoc(doc(db(DEV), 'wards', 'w4'), ward('w4', { name: '' })));
    await assertFails(updateDoc(doc(db(HEAD), 'wards', W1), { name: 'renamed', updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(db(DEV), 'wards', W1), { name: 'renamed' }));
    await assertFails(deleteDoc(doc(db(HEAD), 'wards', 'w3')));
    await assertSucceeds(deleteDoc(doc(db(DEV), 'wards', 'w3')));
  });

  it('a head nurse tunes staffing and swap policy of their own ward only', async () => {
    const patch = { weekdayDemand: { D: 3, E: 2, N: 2 }, requireHeadApproval: true, updatedAt: 2, updatedBy: HEAD };
    await assertSucceeds(updateDoc(doc(db(HEAD), 'wards', W1), patch));
    await assertFails(updateDoc(doc(db(HEAD), 'wards', W2), patch));
    await assertFails(updateDoc(doc(db(HEAD), 'wards', W1), { weekdayDemand: { D: -1, E: 2, N: 2 } }));
    await assertFails(updateDoc(doc(db(A), 'wards', W1), patch));
  });

  it("another ward's head nurse cannot see drafts or edit, publish or delete schedules", async () => {
    await assertFails(getDoc(doc(db(HEAD2), 'schedules', DRAFT)));
    // Published rosters stay readable by all staff, as before.
    await assertSucceeds(getDoc(doc(db(HEAD2), 'schedules', SID)));
    await assertFails(updateDoc(doc(db(HEAD2), 'schedules', SID), new FieldPath('assignments', A), ROW_C));
    await assertFails(updateDoc(doc(db(HEAD2), 'schedules', DRAFT), { status: 'published' }));
    await assertFails(deleteDoc(doc(db(HEAD2), 'schedules', DRAFT)));
    await assertFails(setDoc(doc(db(HEAD2), 'schedules', `${W1}_2027-02-01`), schedule(W1, '2027-02-01', 'draft')));
    await assertSucceeds(setDoc(doc(db(HEAD2), 'schedules', `${W2}_2027-02-01`), schedule(W2, '2027-02-01', 'draft')));
  });

  it('a head nurse can list their own wards but not the whole collection', async () => {
    await assertSucceeds(getDocs(query(collection(db(HEAD), 'schedules'), where('wardId', '==', W1))));
    await assertFails(getDocs(query(collection(db(HEAD), 'schedules'), where('wardId', '==', W2))));
    await assertFails(getDocs(collection(db(HEAD), 'schedules')));
    await assertSucceeds(getDocs(collection(db(DEV), 'schedules')));
    await assertSucceeds(
      getDocs(query(collection(db(D), 'schedules'), where('wardId', '==', W2), where('status', '==', 'published'))),
    );
  });

  it('a schedule cannot move to another ward, use a mismatched id or name a missing ward', async () => {
    await assertFails(updateDoc(doc(db(HEAD), 'schedules', DRAFT), { wardId: W2 }));
    await assertFails(setDoc(doc(db(HEAD), 'schedules', '2027-02-01'), { ...schedule(W1, '2027-02-01', 'draft'), id: '2027-02-01' }));
    await assertFails(setDoc(doc(db(DEV), 'schedules', 'w9_2027-02-01'), schedule('w9', '2027-02-01', 'draft')));
  });

  it("swap and leave decisions stay with the ward's own head nurse", async () => {
    await assertSucceeds(getDoc(doc(db(HEAD), 'swap_requests', 's1')));
    await assertFails(getDoc(doc(db(HEAD2), 'swap_requests', 's1')));
    await assertFails(updateDoc(doc(db(HEAD2), 'swap_requests', 's1'), { status: 'rejected', updatedAt: 3 }));
    await assertFails(updateDoc(doc(db(HEAD), 'swap_requests', 's1'), { wardId: W2 }));
    await assertSucceeds(updateDoc(doc(db(HEAD), 'swap_requests', 's1'), { status: 'rejected', updatedAt: 3 }));
    await assertSucceeds(getDocs(query(collection(db(HEAD), 'swap_requests'), where('wardId', '==', W1))));
    await assertFails(getDocs(query(collection(db(HEAD2), 'swap_requests'), where('wardId', '==', W1))));

    const leave = {
      wardId: W1,
      nurseId: A,
      nurseName: 'a',
      type: 'AL',
      startDate: '2026-12-10',
      endDate: '2026-12-10',
      note: '',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'leave_requests', 'l1'), leave);
    });
    await assertFails(getDoc(doc(db(HEAD2), 'leave_requests', 'l1')));
    await assertFails(updateDoc(doc(db(HEAD2), 'leave_requests', 'l1'), { status: 'approved' }));
    await assertFails(deleteDoc(doc(db(HEAD2), 'leave_requests', 'l1')));
    await assertFails(updateDoc(doc(db(HEAD), 'leave_requests', 'l1'), { wardId: W2 }));
    await assertSucceeds(updateDoc(doc(db(HEAD), 'leave_requests', 'l1'), { status: 'approved', decidedBy: HEAD }));
    // A head nurse enters leave only for nurses on a ward they manage.
    await assertSucceeds(setDoc(doc(db(HEAD2), 'leave_requests', 'l2'), { ...leave, wardId: W2, nurseId: D, status: 'approved' }));
    await assertFails(setDoc(doc(db(HEAD2), 'leave_requests', 'l3'), { ...leave, wardId: W2, status: 'approved' }));
    await assertFails(setDoc(doc(db(HEAD2), 'leave_requests', 'l4'), { ...leave, status: 'approved' }));
  });

  it('developers can still read and remove schedules from before wards existed', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { wardId: _unused, ...legacy } = schedule(W1, '2026-11-09', 'draft');
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'schedules', '2026-11-09'), { ...legacy, id: '2026-11-09' });
    });
    await assertFails(getDoc(doc(db(HEAD), 'schedules', '2026-11-09')));
    await assertFails(deleteDoc(doc(db(HEAD), 'schedules', '2026-11-09')));
    await assertSucceeds(getDoc(doc(db(DEV), 'schedules', '2026-11-09')));
    await assertSucceeds(deleteDoc(doc(db(DEV), 'schedules', '2026-11-09')));
  });
});
