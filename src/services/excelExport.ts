/**
 * Excel export with SheetJS (Community Edition).
 * Sheet 1 「班表」: staff rows × 28 days + per-nurse totals + daily headcount / N2+ summary rows.
 * Sheet 2 「規則檢查」: all validation findings.
 * Sheet 3 「圖例」: shift code legend.
 */
import { utils, writeFile, type WorkBook } from 'xlsx';
import { RULE_LABELS, SHIFT_META, WEEKDAY_LABELS } from '@/constants/labels';
import { SHIFT_CODES, type DayInfo, type NurseSnapshot, type Schedule, type Severity } from '@/types/schedule';
import { formatDateTime, formatMD, formatPeriod } from '@/utils/dates';
import type { EvaluationResult } from '@/utils/scheduler';

const SEVERITY_LABEL: Record<Severity, string> = { error: '錯誤', warning: '警告', info: '提示' };

export interface ExportParams {
  wardName: string;
  schedule: Schedule;
  days: DayInfo[];
  nurses: NurseSnapshot[];
  evaluation: EvaluationResult;
}

export function buildScheduleWorkbook(p: ExportParams): WorkBook {
  const { schedule, days, nurses, evaluation } = p;
  const nDays = days.length;
  const fixedCols = 3;
  const totalHeaders = ['上班', '休假', '請假', '白班', '小夜', '大夜'];
  const width = fixedCols + nDays + totalHeaders.length;

  const title = `${p.wardName} 護理排班表　${formatPeriod(schedule.startDate, schedule.endDate)}`;
  const status = `狀態：${schedule.status === 'published' ? '已發布' : '草稿'}　匯出時間：${formatDateTime(Date.now())}`;

  const rows: (string | number | null)[][] = [
    [title],
    [status],
    ['姓名', '員工編號', '職級', ...days.map((d) => formatMD(d.date)), ...totalHeaders],
    ['', '', '', ...days.map((d) => `${WEEKDAY_LABELS[d.dow]}${d.isHoliday ? '（假）' : ''}`), ...totalHeaders.map(() => '')],
  ];

  for (const nurse of nurses) {
    const row = schedule.assignments[nurse.id] ?? [];
    const s = evaluation.nurseStats[nurse.id];
    rows.push([
      nurse.name,
      nurse.employeeId,
      nurse.level,
      ...days.map((d) => row[d.index] ?? ''),
      s?.work ?? 0,
      s?.rest ?? 0,
      s?.leave ?? 0,
      s?.counts.D ?? 0,
      s?.counts.E ?? 0,
      s?.counts.N ?? 0,
    ]);
  }

  rows.push([]);
  const summary = (label: string, values: number[]) => [label, '', '', ...values];
  rows.push(summary('白班 D 人數', evaluation.cover.D));
  rows.push(summary('白班 D 需求', evaluation.demand.D));
  rows.push(summary('小夜 E 人數', evaluation.cover.E));
  rows.push(summary('小夜 E 需求', evaluation.demand.E));
  rows.push(summary('大夜 N 人數', evaluation.cover.N));
  rows.push(summary('大夜 N 需求', evaluation.demand.N));
  rows.push(summary('N2+（白班）', evaluation.senior.D));
  rows.push(summary('N2+（小夜）', evaluation.senior.E));
  rows.push(summary('N2+（大夜）', evaluation.senior.N));

  const sheet = utils.aoa_to_sheet(rows);
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: width - 1 } },
  ];
  sheet['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 6 },
    ...days.map(() => ({ wch: 6 })),
    ...totalHeaders.map(() => ({ wch: 6 })),
  ];

  const issues = utils.aoa_to_sheet([
    ['嚴重度', '規則', '說明'],
    ...evaluation.violations.map((v) => [SEVERITY_LABEL[v.severity], RULE_LABELS[v.rule], v.message]),
  ]);
  issues['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 60 }];

  const legend = utils.aoa_to_sheet([
    ['代碼', '說明'],
    ...SHIFT_CODES.map((c) => [c, SHIFT_META[c].label]),
  ]);

  const wb = utils.book_new();
  utils.book_append_sheet(wb, sheet, '班表');
  utils.book_append_sheet(wb, issues, '規則檢查');
  utils.book_append_sheet(wb, legend, '圖例');
  return wb;
}

export function exportScheduleXlsx(p: ExportParams): string {
  const filename = `班表_${p.schedule.startDate}_${p.schedule.endDate}.xlsx`;
  writeFile(buildScheduleWorkbook(p), filename, { compression: true });
  return filename;
}
