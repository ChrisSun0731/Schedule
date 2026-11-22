/**
 * Core domain types for the nursing shift scheduling system.
 *
 * Conventions
 * - A user/nurse is identified by their lower-case e-mail (also the `users` document id),
 *   which is what Firebase Auth (Google provider) gives us in the ID token.
 * - A schedule period is always 28 days (4 fixed calendar weeks: day 1–7, 8–14, 15–21, 22–28).
 *   Day indexes are 0-based in code (0..27) and shown 1-based in the UI.
 * - Dates are ISO strings `YYYY-MM-DD` (no time zone); timestamps are epoch milliseconds.
 */

export const PERIOD_DAYS = 28;
export const WEEK_DAYS = 7;
export const WEEKS_PER_PERIOD = PERIOD_DAYS / WEEK_DAYS;

// ---------------------------------------------------------------------------
// Shifts, leave & levels
// ---------------------------------------------------------------------------

/**
 * Cell codes. Stored in Firestore – never rename or reorder the first four (the scheduler
 * encodes D/E/N/OFF as 0–3).
 * - Work:  D 白班, E 小夜, N 大夜
 * - Rest (count toward 例假 / 休息日):  OFF 休假, REQ 預假
 * - Leave (replaces a working day; never counts as rest):
 *   AL 年休(特休), OL 公假, SL 病假, PL 事假, MNL 生理假, CO 補休,
 *   BL 喪假, WL 婚假, MAT 產假, PAT 陪產假(陪產檢及陪產假), IL 公傷假(公傷病假)
 */
export const SHIFT_CODES = ['D', 'E', 'N', 'OFF', 'AL', 'OL', 'REQ', 'SL', 'PL', 'MNL', 'CO', 'BL', 'WL', 'MAT', 'PAT', 'IL'] as const;
export type ShiftCode = (typeof SHIFT_CODES)[number];

export const WORK_SHIFTS = ['D', 'E', 'N'] as const;
export type WorkShift = (typeof WORK_SHIFTS)[number];

/** Everything a nurse can request on the leave page (display order). */
export const LEAVE_TYPES = ['AL', 'OL', 'REQ', 'SL', 'PL', 'MNL', 'CO', 'BL', 'WL', 'MAT', 'PAT', 'IL'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

/**
 * Placement order of approved leave competing for scarce staff (lower first; ties are
 * first-come-first-served): statutory leave > AL 年休 > OL 公假 > CO 補休 > PL 事假 > REQ 預假.
 *
 * Priority 0 = statutory leave (勞工請假規則、性別平等工作法) the employer may not refuse: once
 * approved the leave planner always places it, even on a short-staffed day – the shortage then
 * shows up as a coverage error for the head nurse to fill, instead of rostering a sick nurse.
 */
export const LEAVE_PRIORITY: Record<LeaveType, number> = {
  SL: 0,
  MNL: 0,
  BL: 0,
  WL: 0,
  MAT: 0,
  PAT: 0,
  IL: 0,
  AL: 1,
  OL: 2,
  CO: 3,
  PL: 4,
  REQ: 5,
};

export function isStatutoryLeave(type: LeaveType | null | undefined): boolean {
  return !!type && LEAVE_PRIORITY[type] === 0;
}

export const STATUTORY_LEAVE_TYPES: readonly LeaveType[] = LEAVE_TYPES.filter(isStatutoryLeave);

/** Leave that competes for staff, highest priority first. */
export const DISCRETIONARY_LEAVE_TYPES: readonly LeaveType[] = LEAVE_TYPES.filter((t) => !isStatutoryLeave(t)).sort(
  (a, b) => LEAVE_PRIORITY[a] - LEAVE_PRIORITY[b],
);

export const NURSE_LEVELS = ['N0', 'N1', 'N2', 'N3'] as const;
export type NurseLevel = (typeof NURSE_LEVELS)[number];

export const USER_ROLES = ['developer', 'head_nurse', 'nurse'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isWorkShift(code: ShiftCode | null | undefined): code is WorkShift {
  return code === 'D' || code === 'E' || code === 'N';
}

/** OFF and REQ are rest days (count toward 例假 / 休息日). */
export function isRestDay(code: ShiftCode | null | undefined): boolean {
  return code === 'OFF' || code === 'REQ';
}

/** Leave other than REQ replaces a working day (it does not count as a rest day). */
export function isLeaveDay(code: ShiftCode | null | undefined): boolean {
  return !!code && !isWorkShift(code) && !isRestDay(code);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserProfile {
  /** Lower-case e-mail; also the Firestore document id. */
  id: string;
  email: string;
  displayName: string;
  employeeId: string;
  role: UserRole;
  /**
   * Wards (病房單位) this person belongs to.
   * - nurse: the ward whose roster they are on (normally exactly one);
   * - head_nurse: every ward they manage – they may schedule, publish and approve only there;
   * - developer: ignored (developers manage every ward).
   */
  wardIds: string[];
  level: NurseLevel;
  /** Shifts this nurse may be assigned to by the auto-scheduler. */
  allowedShifts: WorkShift[];
  /** Included as a row in new schedules. */
  schedulable: boolean;
  active: boolean;
  uid?: string | null;
  photoURL?: string | null;
  lastLoginAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

// ---------------------------------------------------------------------------
// Rules & settings
// ---------------------------------------------------------------------------

export interface StaffingDemand {
  D: number;
  E: number;
  N: number;
}

export interface ShiftTime {
  /** "HH:mm" */
  start: string;
  /** "HH:mm"; "24:00" allowed. An end earlier than start means the shift crosses midnight. */
  end: string;
}

export interface RuleConfig {
  /** Mon–Fri */
  weekdayDemand: StaffingDemand;
  /** Sat, Sun and public holidays */
  weekendDemand: StaffingDemand;
  /** Hard minimum of N2+ nurses on every shift. */
  minSeniorPerShift: number;
  /** Preferred number of N2+ nurses on every shift (warning when below). */
  preferredSeniorPerShift: number;
  seniorLevels: NurseLevel[];
  maxConsecutiveWork: number;
  maxConsecutiveOff: number;
  /** 例假: rest days required inside every fixed 7-day week. */
  minOffPerWeek: number;
  /** 例假 + 休息日 required in the 28-day period. */
  minOffPerPeriod: number;
  /** Minimum rest between two shifts on consecutive days (勞基法 §34: 11 h). 0 disables the rule. */
  minRestHours: number;
  shiftTimes: Record<WorkShift, ShiftTime>;
}

/**
 * Hospital-wide settings (`settings/app`): labour rules, shift times, holidays, e-mail.
 * The staffing fields inherited from RuleConfig are only the defaults for a new ward –
 * each ward keeps its own (see `Ward`).
 */
export interface AppSettings extends RuleConfig {
  /** @deprecated Single-ward installs only; becomes the first ward's name when migrating. */
  wardName: string;
  /** Public URL of the portal used in e-mails. Empty = current origin. */
  portalUrl: string;
  /** ISO dates treated like weekends (weekend staffing demand). */
  holidays: string[];
  /** @deprecated Moved to `Ward.requireHeadApproval`; read only when migrating. */
  requireHeadApproval: boolean;
  emailSenderName: string;
  updatedAt?: number;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Wards (病房單位)
// ---------------------------------------------------------------------------

/** Rule fields every ward sets for itself; the rest of RuleConfig is hospital-wide. */
export const WARD_RULE_KEYS = ['weekdayDemand', 'weekendDemand', 'minSeniorPerShift', 'preferredSeniorPerShift'] as const;
export type WardRules = Pick<RuleConfig, (typeof WARD_RULE_KEYS)[number]>;

export interface Ward extends WardRules {
  /** Firestore document id (also a prefix of the ward's schedule ids). */
  id: string;
  name: string;
  /** Menu order (ascending). */
  order: number;
  /** Swaps approved by the target nurse still need head-nurse approval. */
  requireHeadApproval: boolean;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export type ScheduleStatus = 'draft' | 'published';

export interface NurseSnapshot {
  id: string;
  name: string;
  employeeId: string;
  level: NurseLevel;
  email: string;
  allowedShifts: WorkShift[];
}

export interface Schedule {
  /** `${wardId}_${startDate}` (see `scheduleIdOf`). Single-ward installs used the bare start date. */
  id: string;
  /** Ward this roster belongs to ('' = created before wards existed, see WardsPage migration). */
  wardId: string;
  startDate: string;
  endDate: string;
  status: ScheduleStatus;
  /** Row order. */
  nurseOrder: string[];
  nurses: Record<string, NurseSnapshot>;
  /** nurseId → 28 shift codes. */
  assignments: Record<string, ShiftCode[]>;
  /** nurseId → locked day indexes (kept by the auto-scheduler). */
  locks: Record<string, number[]>;
  /** Day indexes that use weekend/holiday staffing. */
  holidays: number[];
  lastSwapId?: string | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  generatedAt?: number | null;
  publishedAt?: number | null;
  publishedBy?: string | null;
}

export interface DayInfo {
  index: number;
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  dow: number;
  week: number;
  isWeekend: boolean;
  isHoliday: boolean;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  /** Ward whose head nurse decides the request (the nurse's ward when filed). */
  wardId: string;
  nurseId: string;
  nurseName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  note: string;
  status: LeaveStatus;
  createdAt: number;
  updatedAt: number;
  decidedBy?: string | null;
  decidedAt?: number | null;
}

export type SwapStatus = 'pending_target' | 'pending_head' | 'approved' | 'rejected' | 'cancelled';

export interface SwapRequest {
  id: string;
  scheduleId: string;
  /** Ward of the schedule (copied so head nurses can query their own wards). */
  wardId: string;

  requesterId: string;
  requesterName: string;
  requesterEmployeeId: string;
  requesterEmail: string;
  requesterDay: number;
  requesterDate: string;
  requesterShift: ShiftCode;

  targetId: string;
  targetName: string;
  targetEmployeeId: string;
  /** Address the consent e-mail is sent to (defaults to the target's registered e-mail). */
  targetEmail: string;
  targetDay: number;
  targetDate: string;
  targetShift: ShiftCode;

  note: string;
  status: SwapStatus;
  /** Rule problems the swap introduces (filled when the target approves). */
  warnings: string[];
  responseNote?: string;
  emailStatus?: 'sent' | 'failed' | null;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number | null;
  decidedBy?: string | null;
  decidedAt?: number | null;
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export type EmailType = 'schedule' | 'swap_request' | 'swap_result';
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'retrying';
export type EmailProviderId = 'mock' | 'firestore' | 'function' | 'emailjs';

export interface EmailLog {
  id: string;
  type: EmailType;
  to: string;
  toName: string;
  subject: string;
  status: DeliveryStatus;
  attempts: number;
  error?: string | null;
  provider: EmailProviderId;
  scheduleId?: string | null;
  swapId?: string | null;
  sentBy: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'coverage_under'
  | 'coverage_over'
  | 'senior_min'
  | 'senior_preferred'
  | 'max_consecutive_work'
  | 'max_consecutive_off'
  | 'weekly_off'
  | 'period_off'
  | 'shift_rest'
  | 'shift_not_allowed'
  | 'under_hours';

export interface Violation {
  rule: RuleId;
  severity: Severity;
  message: string;
  nurseId?: string;
  /** Primary day index (for highlighting / scrolling). */
  day?: number;
  /** All affected day indexes (nurse rules). */
  days?: number[];
  shift?: WorkShift;
}
