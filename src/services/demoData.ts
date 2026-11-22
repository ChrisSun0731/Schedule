import type { NurseLevel, UserProfile, Ward, WorkShift } from '@/types/schedule';
import { DEFAULT_RULES } from '@/utils/scheduler';
import { wardRulesOf } from '@/utils/wards';

/** Fictional names for demo / test data. */
const NAMES = [
  '王怡君', '林雅婷', '陳佳穎', '張詩涵', '李欣怡', '黃郁婷', '吳佩珊', '劉宜蓁', '蔡雅雯', '楊思妤',
  '許家瑜', '鄭婉婷', '謝佳慧', '洪筱涵', '郭怡萱', '邱靜宜', '曾雅琪', '廖品妤', '賴宛蓉', '徐珮瑜',
  '周家欣', '葉芷瑄', '蘇曉雯', '莊佳琪', '呂宜庭', '江惠如', '何映萱', '羅子晴', '高郁雯', '潘思穎',
  '方雅筑', '石佩怡', '沈欣妤', '孫語彤', '馬子涵', '卓靜怡', '田書瑜', '韓詠晴', '魏宜珊', '簡若萱',
  '袁筱婷', '鍾沛涵', '顏欣蓓', '白若瑜', '董采潔', '姚婕妤',
];

/** 4 × N3, 9 × N2, 10 × N1, 7 × N0 */
const LEVELS: NurseLevel[] = [
  ...Array<NurseLevel>(4).fill('N3'),
  ...Array<NurseLevel>(9).fill('N2'),
  ...Array<NurseLevel>(10).fill('N1'),
  ...Array<NurseLevel>(7).fill('N0'),
];

/** Fixed ids so importing twice does not duplicate the demo wards. */
export const DEMO_WARD_IDS = { general: 'demo-5a', icu: 'demo-icu' } as const;

/**
 * Two demo wards run by the same head nurse:
 * - 5A 內科病房: the default demand (D10/E6/N5, weekend D8/E6/N5) for 30 nurses;
 * - ICU 加護病房: D4/E3/N3 every day for 16 mostly senior nurses.
 */
export function createDemoWards(by = 'demo'): Ward[] {
  const now = Date.now();
  return [
    {
      id: DEMO_WARD_IDS.general,
      name: '5A 內科病房',
      order: 1,
      requireHeadApproval: false,
      ...wardRulesOf(DEFAULT_RULES),
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
    },
    {
      id: DEMO_WARD_IDS.icu,
      name: 'ICU 加護病房',
      order: 2,
      requireHeadApproval: true,
      weekdayDemand: { D: 4, E: 3, N: 3 },
      weekendDemand: { D: 4, E: 3, N: 3 },
      minSeniorPerShift: 1,
      preferredSeniorPerShift: 2,
      createdAt: now,
      updatedAt: now,
      updatedBy: by,
    },
  ];
}

/**
 * Demo nurses `nurse{first}`… on one ward. The default 30 (5A) are enough to staff weekday
 * D10/E6/N5 and weekend D8/E6/N5 with 8 rest days each and a few days of leave.
 */
export function createDemoNurses(domain = 'example.com', count = 30, wardId: string = DEMO_WARD_IDS.general, first = 1): UserProfile[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const n = first + i;
    const no = String(n).padStart(2, '0');
    const email = `nurse${no}@${domain}`;
    // One nurse does not work nights, one works days only — realistic restrictions.
    const allowedShifts: WorkShift[] = i === 27 ? ['D', 'E'] : i === 28 ? ['D'] : ['D', 'E', 'N'];
    return {
      id: email,
      email,
      displayName: NAMES[(n - 1) % NAMES.length]!,
      employeeId: `RN${String(n).padStart(3, '0')}`,
      role: 'nurse',
      wardIds: [wardId],
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

/** 16 ICU nurses (`nurse31`–`nurse46`). */
export function createDemoIcuNurses(domain = 'example.com'): UserProfile[] {
  return createDemoNurses(domain, 16, DEMO_WARD_IDS.icu, 31);
}

/** Demo head-nurse account managing both demo wards (not on either roster). */
export function createDemoHeadNurse(domain = 'example.com'): UserProfile {
  const now = Date.now();
  const email = `head@${domain}`;
  return {
    id: email,
    email,
    displayName: '陳護理長',
    employeeId: 'HN001',
    role: 'head_nurse',
    wardIds: [DEMO_WARD_IDS.general, DEMO_WARD_IDS.icu],
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
