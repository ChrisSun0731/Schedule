import type {
  DeliveryStatus,
  EmailType,
  LeaveStatus,
  LeaveType,
  RuleId,
  ShiftCode,
  SwapStatus,
  UserRole,
} from '@/types/schedule';

export interface ShiftMeta {
  label: string;
  /** Text shown inside grid cells. */
  short: string;
  /** CSS class (see src/css/app.scss). */
  cls: string;
  /** Background / text colours, used where CSS classes are unavailable (e-mail). */
  bg: string;
  fg: string;
}

export const SHIFT_META: Record<ShiftCode, ShiftMeta> = {
  D: { label: '白班', short: 'D', cls: 'shift-d', bg: '#fff3c4', fg: '#7a5600' },
  E: { label: '小夜', short: 'E', cls: 'shift-e', bg: '#ffdcc2', fg: '#8a3700' },
  N: { label: '大夜', short: 'N', cls: 'shift-n', bg: '#d9defc', fg: '#26337f' },
  OFF: { label: '休假', short: 'OFF', cls: 'shift-off', bg: '#eef1f4', fg: '#4f5b67' },
  AL: { label: '年休', short: 'AL', cls: 'shift-al', bg: '#d3f5df', fg: '#14653a' },
  OL: { label: '公假', short: 'OL', cls: 'shift-ol', bg: '#d6eefc', fg: '#0b5a85' },
  REQ: { label: '預假', short: 'REQ', cls: 'shift-req', bg: '#efe2fd', fg: '#6a2aa6' },
  SL: { label: '病假', short: 'SL', cls: 'shift-sl', bg: '#fde0e0', fg: '#a11d1d' },
  PL: { label: '事假', short: 'PL', cls: 'shift-pl', bg: '#f5e8d0', fg: '#6e4710' },
  MNL: { label: '生理假', short: 'MNL', cls: 'shift-mnl', bg: '#f8def4', fg: '#8a1f7e' },
  CO: { label: '補休', short: 'CO', cls: 'shift-co', bg: '#d3f2ef', fg: '#0c5d56' },
  BL: { label: '喪假', short: 'BL', cls: 'shift-bl', bg: '#dcd8d3', fg: '#35302b' },
  WL: { label: '婚假', short: 'WL', cls: 'shift-wl', bg: '#fde1ec', fg: '#9c1850' },
  MAT: { label: '產假', short: 'MAT', cls: 'shift-mat', bg: '#fde4d6', fg: '#93330f' },
  PAT: { label: '陪產假', short: 'PAT', cls: 'shift-pat', bg: '#e4f2d0', fg: '#3f5c10' },
  IL: { label: '公傷假', short: 'IL', cls: 'shift-il', bg: '#ecdcd3', fg: '#6b2e18' },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  developer: '系統管理員',
  head_nurse: '護理長',
  nurse: '護理師',
};

export const LEAVE_LABELS: Record<LeaveType, string> = {
  AL: '年休（特休）',
  OL: '公假',
  REQ: '預假',
  SL: '病假',
  PL: '事假',
  MNL: '生理假',
  CO: '補休',
  BL: '喪假',
  WL: '婚假',
  MAT: '產假',
  PAT: '陪產假',
  IL: '公傷假',
};

// Status colours: `pending` = waiting on someone, positive/negative = decided, `muted` = withdrawn.
// All fills carry white text at ≥ 4.5:1 (and dark text in dark mode, see app.scss).
export const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; color: string }> = {
  pending: { label: '待審核', color: 'pending' },
  approved: { label: '已核准', color: 'positive' },
  rejected: { label: '已駁回', color: 'negative' },
  cancelled: { label: '已取消', color: 'muted' },
};

export const SWAP_STATUS_META: Record<SwapStatus, { label: string; color: string; icon: string }> = {
  pending_target: { label: '待對方同意', color: 'pending', icon: 'hourglass_top' },
  pending_head: { label: '待護理長審核', color: 'pending', icon: 'supervisor_account' },
  approved: { label: '已核准', color: 'positive', icon: 'check_circle' },
  rejected: { label: '已拒絕', color: 'negative', icon: 'cancel' },
  cancelled: { label: '已取消', color: 'muted', icon: 'block' },
};

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; color: string; icon: string }> = {
  queued: { label: '排隊中', color: 'muted', icon: 'schedule' },
  sending: { label: '傳送中', color: 'primary', icon: 'send' },
  sent: { label: '已送出', color: 'positive', icon: 'mark_email_read' },
  failed: { label: '失敗', color: 'negative', icon: 'error' },
  retrying: { label: '重試中', color: 'pending', icon: 'autorenew' },
};

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  schedule: '個人班表',
  swap_request: '換班徵詢',
  swap_result: '換班結果',
};

export const RULE_LABELS: Record<RuleId, string> = {
  coverage_under: '人力不足',
  coverage_over: '人力過剩',
  senior_min: 'N2+ 不足',
  senior_preferred: 'N2+ 低於建議',
  max_consecutive_work: '連續上班過長',
  max_consecutive_off: '連續休假過長',
  weekly_off: '每週例假不足',
  period_off: '四週休假不足',
  shift_rest: '班距不足',
  shift_not_allowed: '不可排班別',
  under_hours: '工時不足',
};

/** Index = Date#getUTCDay() */
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
