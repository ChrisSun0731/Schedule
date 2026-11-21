/**
 * Traditional Chinese e-mail templates (HTML with inline styles + plain-text fallback).
 */
import { SHIFT_META, SWAP_STATUS_META } from '@/constants/labels';
import type { DayInfo, NurseSnapshot, ShiftCode, SwapRequest, SwapStatus } from '@/types/schedule';
import { formatMDW, formatPeriod, weekdayLabel, formatMD } from '@/utils/dates';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const FONT = "'Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif";

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f6f8;font-family:${FONT};color:#1f2933;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8ec;">
<tr><td style="background:#0f6e72;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:24px;">${body}</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafb;color:#7b8794;font-size:12px;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#0f6e72;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a>`;
}

function shiftBadge(code: ShiftCode | undefined): string {
  if (!code) return '<span style="color:#9aa5b1;">—</span>';
  const meta = SHIFT_META[code];
  return `<span style="display:inline-block;min-width:36px;padding:3px 6px;border-radius:6px;background:${meta.bg};color:${meta.fg};font-weight:700;font-size:13px;">${meta.short}</span>`;
}

const AUTO_FOOTER = '此郵件由護理排班系統自動寄出，請勿直接回覆。';

export function portalLink(portalUrl: string, route: string): string {
  const base = portalUrl.replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${base}#${route}`;
}

// ---------------------------------------------------------------------------
// Monthly (28-day) schedule
// ---------------------------------------------------------------------------

export function renderScheduleEmail(p: {
  wardName: string;
  nurse: NurseSnapshot;
  row: ShiftCode[];
  days: DayInfo[];
  startDate: string;
  endDate: string;
  portalUrl: string;
}): RenderedEmail {
  const period = formatPeriod(p.startDate, p.endDate);
  const counts: Record<ShiftCode, number> = { D: 0, E: 0, N: 0, OFF: 0, AL: 0, OL: 0, REQ: 0 };
  p.row.forEach((c) => counts[c]++);
  const work = counts.D + counts.E + counts.N;
  const rest = counts.OFF + counts.REQ;
  const leave = counts.AL + counts.OL;
  const swapUrl = portalLink(p.portalUrl, '/swaps');
  const subject = `【${p.wardName}】${period} 個人班表`;

  const weeks: string[] = [];
  for (let w = 0; w < Math.ceil(p.days.length / 7); w++) {
    const cells = p.days.slice(w * 7, w * 7 + 7).map((d) => {
      const weekend = d.isWeekend || d.isHoliday;
      return `<td align="center" style="padding:8px 2px;border:1px solid #e3e8ec;background:${weekend ? '#fbf7f2' : '#ffffff'};">
<div style="font-size:12px;color:${weekend ? '#c2410c' : '#52606d'};">${formatMD(d.date)}（${weekdayLabel(d.date)}）</div>
<div style="margin-top:4px;">${shiftBadge(p.row[d.index])}</div></td>`;
    });
    weeks.push(`<tr><td style="padding:8px 6px;border:1px solid #e3e8ec;background:#f8fafb;font-size:12px;color:#52606d;white-space:nowrap;">第 ${w + 1} 週</td>${cells.join('')}</tr>`);
  }

  const stat = (label: string, value: number, color = '#1f2933') =>
    `<td align="center" style="padding:8px 4px;"><div style="font-size:22px;font-weight:700;color:${color};">${value}</div><div style="font-size:12px;color:#7b8794;">${label}</div></td>`;

  const distribution = (['D', 'E', 'N', 'AL', 'OL', 'REQ'] as const)
    .filter((c) => counts[c] > 0 || c === 'D' || c === 'E' || c === 'N')
    .map((c) => `${shiftBadge(c)} <span style="font-size:13px;color:#52606d;margin-right:10px;">${SHIFT_META[c].label} ${counts[c]} 天</span>`)
    .join(' ');

  const body = `
<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(p.nurse.name)} 您好：</p>
<p style="margin:0 0 16px;font-size:14px;color:#52606d;">以下是您 <strong style="color:#1f2933;">${period}</strong>（28 天）的班表。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;border-radius:10px;margin-bottom:16px;"><tr>
${stat('上班', work, '#0f6e72')}${stat('休假', rest)}${stat('請假', leave)}${stat('白班', counts.D)}${stat('小夜', counts.E)}${stat('大夜', counts.N)}
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:12px;">${weeks.join('')}</table>
<p style="margin:0 0 20px;line-height:2;">${distribution}</p>
<p style="margin:0 0 8px;">${button(swapUrl, '登入系統申請換班')}</p>
<p style="margin:12px 0 0;font-size:12px;color:#9aa5b1;">D 白班 ${'·'} E 小夜 ${'·'} N 大夜 ${'·'} OFF 休假 ${'·'} AL 年休 ${'·'} OL 公假 ${'·'} REQ 預假</p>`;

  const lines = p.days.map((d) => {
    const code = p.row[d.index];
    return `${formatMDW(d.date)}  ${code ?? '-'}${code ? ` ${SHIFT_META[code].label}` : ''}`;
  });
  const text = [
    `${p.nurse.name} 您好：`,
    '',
    `以下是您 ${period}（28 天）的班表。`,
    `上班 ${work} 天、休假 ${rest} 天、請假 ${leave} 天；白班 ${counts.D}、小夜 ${counts.E}、大夜 ${counts.N}。`,
    '',
    ...lines,
    '',
    `申請換班：${swapUrl}`,
    '',
    AUTO_FOOTER,
  ].join('\n');

  return { subject, html: layout(subject, body, AUTO_FOOTER), text };
}

// ---------------------------------------------------------------------------
// Swap consent request (to the target nurse)
// ---------------------------------------------------------------------------

/** Codes on the two swap days before the swap: [requesterDay, targetDay]. */
export interface SwapCells {
  requester: [ShiftCode, ShiftCode];
  target: [ShiftCode, ShiftCode];
}

function swapTable(swap: SwapRequest, cells: SwapCells, perspective: 'target' | 'requester'): string {
  const sameDay = swap.requesterDay === swap.targetDay;
  const rows: { date: string; requesterBefore: ShiftCode; targetBefore: ShiftCode }[] = [
    { date: swap.requesterDate, requesterBefore: cells.requester[0], targetBefore: cells.target[0] },
  ];
  if (!sameDay) rows.push({ date: swap.targetDate, requesterBefore: cells.requester[1], targetBefore: cells.target[1] });
  const me = perspective === 'target' ? '您' : escapeHtml(swap.targetName);
  const them = perspective === 'target' ? escapeHtml(swap.requesterName) : '您';
  const th = 'style="padding:8px;border:1px solid #e3e8ec;background:#f8fafb;font-size:13px;color:#52606d;"';
  const td = 'style="padding:8px;border:1px solid #e3e8ec;font-size:14px;"';
  const body = rows
    .map(
      (r) => `<tr><td ${td}>${formatMDW(r.date)}</td>
<td ${td}>${shiftBadge(r.targetBefore)} → ${shiftBadge(r.requesterBefore)}</td>
<td ${td}>${shiftBadge(r.requesterBefore)} → ${shiftBadge(r.targetBefore)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 16px;">
<tr><th ${th} align="left">日期</th><th ${th} align="left">${me}（原 → 換後）</th><th ${th} align="left">${them}（原 → 換後）</th></tr>${body}</table>`;
}

export function renderSwapRequestEmail(p: {
  wardName: string;
  swap: SwapRequest;
  cells: SwapCells;
  portalUrl: string;
}): RenderedEmail {
  const { swap } = p;
  const url = portalLink(p.portalUrl, `/swaps?id=${encodeURIComponent(swap.id)}`);
  const subject = `【換班徵詢】${swap.requesterName} 想與您換班（${formatMD(swap.requesterDate)}${
    swap.requesterDay === swap.targetDay ? '' : ` ↔ ${formatMD(swap.targetDate)}`
  }）`;
  const note = swap.note ? `<p style="margin:0 0 16px;padding:10px 12px;background:#f8fafb;border-left:3px solid #0f6e72;font-size:14px;">${escapeHtml(swap.note)}</p>` : '';
  const body = `
<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(swap.targetName)} 您好：</p>
<p style="margin:0;font-size:14px;color:#52606d;">${escapeHtml(swap.requesterName)}（${escapeHtml(swap.requesterEmployeeId)}）提出換班申請，內容如下：</p>
${swapTable(swap, p.cells, 'target')}
${note}
<p style="margin:0 0 8px;">${button(url, '登入系統同意或拒絕')}</p>
<p style="margin:12px 0 0;font-size:12px;color:#9aa5b1;">請使用 Google 帳號登入。同意後系統會檢查排班規則，必要時交由護理長審核。</p>`;
  const text = [
    `${swap.targetName} 您好：`,
    '',
    `${swap.requesterName}（${swap.requesterEmployeeId}）提出換班申請：`,
    `${formatMDW(swap.requesterDate)} 對方 ${p.cells.requester[0]} ↔ 您 ${p.cells.target[0]}`,
    ...(swap.requesterDay === swap.targetDay ? [] : [`${formatMDW(swap.targetDate)} 對方 ${p.cells.requester[1]} ↔ 您 ${p.cells.target[1]}`]),
    swap.note ? `備註：${swap.note}` : '',
    '',
    `同意或拒絕：${url}`,
    '',
    AUTO_FOOTER,
  ].join('\n');
  return { subject: `【${p.wardName}】${subject}`, html: layout(subject, body, AUTO_FOOTER), text };
}

// ---------------------------------------------------------------------------
// Swap result (to requester and/or target)
// ---------------------------------------------------------------------------

export function renderSwapResultEmail(p: {
  wardName: string;
  swap: SwapRequest;
  status: SwapStatus;
  recipientName: string;
  cells: SwapCells;
  portalUrl: string;
  decidedBy?: string;
}): RenderedEmail {
  const meta = SWAP_STATUS_META[p.status];
  const url = portalLink(p.portalUrl, '/schedule');
  const subject = `【換班結果】${meta.label}：${p.swap.requesterName} ↔ ${p.swap.targetName}`;
  const explain: Record<SwapStatus, string> = {
    approved: '換班已核准並更新至班表。',
    rejected: '換班申請未獲同意。',
    pending_head: '對方已同意，但換班後有排班規則需確認，已送護理長審核。',
    pending_target: '換班申請等待對方回覆。',
    cancelled: '換班申請已取消。',
  };
  const warnings = p.swap.warnings?.length
    ? `<ul style="margin:0 0 16px;padding-left:20px;color:#b42318;font-size:13px;">${p.swap.warnings
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join('')}</ul>`
    : '';
  const body = `
<p style="margin:0 0 12px;font-size:15px;">${escapeHtml(p.recipientName)} 您好：</p>
<p style="margin:0;font-size:14px;"><strong style="color:#0f6e72;">${meta.label}</strong> — ${explain[p.status]}</p>
${swapTable(p.swap, p.cells, 'requester')}
${warnings}
${p.swap.responseNote ? `<p style="margin:0 0 16px;font-size:14px;color:#52606d;">回覆：${escapeHtml(p.swap.responseNote)}</p>` : ''}
<p style="margin:0;">${button(url, '查看班表')}</p>`;
  const text = [
    `${p.recipientName} 您好：`,
    '',
    `${meta.label} — ${explain[p.status]}`,
    `${p.swap.requesterName} ${formatMDW(p.swap.requesterDate)} ↔ ${p.swap.targetName} ${formatMDW(p.swap.targetDate)}`,
    ...(p.swap.warnings ?? []).map((w) => `• ${w}`),
    '',
    `查看班表：${url}`,
    '',
    AUTO_FOOTER,
  ].join('\n');
  return { subject: `【${p.wardName}】${subject}`, html: layout(subject, body, AUTO_FOOTER), text };
}
