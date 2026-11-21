import type { NurseLevel, UserProfile, WorkShift } from '@/types/schedule';

/** Fictional names for demo / test data. */
const NAMES = [
  '王怡君', '林雅婷', '陳佳穎', '張詩涵', '李欣怡', '黃郁婷', '吳佩珊', '劉宜蓁', '蔡雅雯', '楊思妤',
  '許家瑜', '鄭婉婷', '謝佳慧', '洪筱涵', '郭怡萱', '邱靜宜', '曾雅琪', '廖品妤', '賴宛蓉', '徐珮瑜',
  '周家欣', '葉芷瑄', '蘇曉雯', '莊佳琪', '呂宜庭', '江惠如', '何映萱', '羅子晴', '高郁雯', '潘思穎',
];

/** 4 × N3, 9 × N2, 10 × N1, 7 × N0 */
const LEVELS: NurseLevel[] = [
  ...Array<NurseLevel>(4).fill('N3'),
  ...Array<NurseLevel>(9).fill('N2'),
  ...Array<NurseLevel>(10).fill('N1'),
  ...Array<NurseLevel>(7).fill('N0'),
];

/**
 * 30 demo nurses: enough to staff weekday D10/E6/N5 and weekend D8/E6/N5 with
 * 8 rest days each and a few days of leave.
 */
export function createDemoNurses(domain = 'example.com', count = 30): UserProfile[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    const email = `nurse${no}@${domain}`;
    // One nurse does not work nights, one works days only — realistic restrictions.
    const allowedShifts: WorkShift[] = i === 27 ? ['D', 'E'] : i === 28 ? ['D'] : ['D', 'E', 'N'];
    return {
      id: email,
      email,
      displayName: NAMES[i % NAMES.length]!,
      employeeId: `RN${String(i + 1).padStart(3, '0')}`,
      role: 'nurse',
      level: LEVELS[i % LEVELS.length]!,
      allowedShifts,
      schedulable: true,
      active: true,
      uid: null,
      photoURL: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies UserProfile;
  });
}

/** Demo head-nurse account (not on the roster). */
export function createDemoHeadNurse(domain = 'example.com'): UserProfile {
  const now = Date.now();
  const email = `head@${domain}`;
  return {
    id: email,
    email,
    displayName: '陳護理長',
    employeeId: 'HN001',
    role: 'head_nurse',
    level: 'N3',
    allowedShifts: ['D', 'E', 'N'],
    schedulable: false,
    active: true,
    uid: null,
    photoURL: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
