<template>
  <div ref="scroller" class="roster-scroll" :class="{ 'has-summary': showSummary }">
    <p :id="hintId" class="sr-only">{{ keyboardHint }}</p>
    <table
      class="roster"
      role="grid"
      aria-label="班表"
      :aria-describedby="hintId"
      :style="{ width: rem(tableWidth) }"
      @keydown="onGridKeydown"
      @focusin="onFocusIn"
      @pointerdown="clearJump"
    >
      <colgroup>
        <col :style="{ width: rem(NAME_W) }" />
        <col :style="{ width: rem(LEVEL_W) }" />
        <col v-for="d in days" :key="d.index" :style="{ width: rem(DAY_W) }" />
        <col v-for="i in 3" :key="`s${i}`" :style="{ width: rem(STAT_W) }" />
        <col :style="{ width: rem(ISSUE_W) }" />
      </colgroup>

      <thead>
        <tr class="week-row">
          <th class="sticky-l1 corner" rowspan="2" scope="col">人員</th>
          <th class="sticky-l2 corner" rowspan="2" scope="col">職級</th>
          <th v-for="w in weeks" :key="w.index" :colspan="w.length" scope="colgroup" class="week-head week-start">
            第 {{ w.index + 1 }} 週
            <span class="week-range">{{ w.range }}</span>
          </th>
          <th colspan="3" scope="colgroup" class="week-head stat-sep">統計</th>
          <th
            rowspan="2"
            scope="col"
            class="issue-head nav"
            :data-pos="pos(-1, D + 3)"
            :tabindex="ti(-1, D + 3)"
            aria-label="規則檢查"
          >
            <q-icon name="rule" size="16px" />
          </th>
        </tr>
        <tr class="date-row">
          <th
            v-for="d in days"
            :key="d.index"
            scope="col"
            class="day-head nav"
            :class="{
              'week-start': d.index % 7 === 0,
              weekend: d.isWeekend,
              holiday: d.isHoliday,
              clickable: editable,
              'col-jump': jumpNurse === null && jumpDay === d.index,
            }"
            :data-pos="pos(-1, d.index)"
            :tabindex="ti(-1, d.index)"
            :aria-label="dayLabel(d)"
            @click="activate(-1, d.index, $event.currentTarget as HTMLElement)"
          >
            <div class="day-num">{{ d.date.slice(8, 10) }}</div>
            <div class="day-dow">
              {{ WEEKDAY_LABELS[d.dow] }}<span v-if="d.isHoliday" class="hol-mark" aria-hidden="true">假</span>
            </div>
          </th>
          <th
            v-for="(s, i) in STAT_HEADS"
            :key="s.label"
            scope="col"
            class="stat-col nav"
            :class="{ 'stat-sep': i === 0 }"
            :title="s.title"
            :aria-label="s.title"
            :data-pos="pos(-1, D + i)"
            :tabindex="ti(-1, D + i)"
          >
            {{ s.label }}
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="(nurse, r) in rows" :key="nurse.id" :class="{ 'row-me': nurse.id === meId }">
          <th
            scope="row"
            class="sticky-l1 name-cell nav"
            :class="{ clickable: editable, 'row-jump': jumpNurse === nurse.id && jumpDay === null }"
            :data-pos="pos(r, -1)"
            :tabindex="ti(r, -1)"
            :aria-label="nameLabel(nurse)"
            @click="activate(r, -1, $event.currentTarget as HTMLElement)"
          >
            <div class="name ellipsis">
              {{ nurse.name }}
              <q-icon v-if="nurse.id === meId" name="person_pin" size="13px" class="me-icon" />
            </div>
            <div class="emp ellipsis">{{ nurse.employeeId }}</div>
          </th>
          <td class="sticky-l2 level-cell"><LevelBadge :level="nurse.level" /></td>
          <td
            v-for="d in days"
            :key="d.index"
            :data-pos="pos(r, d.index)"
            :data-cell="`${nurse.id}|${d.index}`"
            :tabindex="ti(r, d.index)"
            :aria-label="cellLabel(nurse, d)"
            class="cell nav"
            :class="cellClass(nurse.id, d.index)"
            @click="activate(r, d.index, $event.currentTarget as HTMLElement)"
          >
            {{ codeAt(nurse.id, d.index) }}
          </td>
          <td
            v-for="(s, i) in STAT_HEADS"
            :key="s.key"
            class="stat-col tabular nav"
            :class="{ 'stat-sep': i === 0 }"
            :data-pos="pos(r, D + i)"
            :tabindex="ti(r, D + i)"
            :aria-label="`${s.title} ${evaluation.nurseStats[nurse.id]?.[s.key] ?? 0} 天`"
          >
            {{ evaluation.nurseStats[nurse.id]?.[s.key] ?? 0 }}
          </td>
          <td
            class="issue-col nav"
            :class="{ clickable: showIssues && !!issuesByNurse[nurse.id] }"
            :data-pos="pos(r, D + 3)"
            :tabindex="ti(r, D + 3)"
            :aria-label="issueLabel(nurse.id)"
            @click="activate(r, D + 3, $event.currentTarget as HTMLElement)"
          >
            <template v-if="showIssues && issuesByNurse[nurse.id]">
              <q-icon
                :name="issuesByNurse[nurse.id]!.errors ? 'error' : 'warning'"
                :color="issuesByNurse[nurse.id]!.errors ? 'negative' : 'warning'"
                size="17px"
              />
              <q-tooltip max-width="320px">
                <div v-for="(v, i) in issuesByNurse[nurse.id]!.list" :key="i">• {{ v.message }}</div>
              </q-tooltip>
            </template>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="D + 6" class="empty-row">
            <div class="empty-row-inner">沒有符合篩選條件的人員</div>
          </td>
        </tr>
      </tbody>

      <tfoot v-if="showSummary">
        <tr v-for="(s, i) in summaryRows" :key="s.key" :class="{ 'sum-first': i === 0, 'sum-senior-first': s.key === 'SD' }">
          <th
            scope="row"
            class="sticky-l1 sum-label nav"
            colspan="2"
            :data-pos="pos(R + i, -1)"
            :tabindex="ti(R + i, -1)"
            :aria-label="s.full"
          >
            <span class="shift-pill sum-pill" :class="s.pill" aria-hidden="true">{{ s.short }}</span>
            <span class="q-ml-xs">{{ s.label }}</span>
          </th>
          <td
            v-for="d in days"
            :key="d.index"
            class="sum-cell tabular nav"
            :class="[sumClass(s.sevKey, d.index), { 'week-start': d.index % 7 === 0 }]"
            :title="s.demand ? `${s.values[d.index]}/${s.demand[d.index]}` : `${s.values[d.index]}`"
            :aria-label="sumLabel(s, d)"
            :data-pos="pos(R + i, d.index)"
            :tabindex="ti(R + i, d.index)"
          >
            {{ s.values[d.index] }}
          </td>
          <td colspan="4" class="sum-tail stat-sep nav" :data-pos="pos(R + i, D)" :tabindex="ti(R + i, D)">
            <span v-if="s.demand">需 {{ demandRange(s.demand) }}</span>
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Cell editor. Focus is handed back to the grid by onCellMenuHide, hence no-refocus. -->
    <q-menu
      v-model="cellMenu.open"
      :target="cellMenu.target"
      no-parent-event
      no-refocus
      anchor="bottom middle"
      self="top middle"
      :offset="[0, 4]"
      @keydown="onPickerKeydown"
      @hide="onCellMenuHide"
    >
      <div v-if="active" class="picker q-pa-sm">
        <div class="picker-title row items-center no-wrap q-px-xs q-mb-xs">
          <span class="ellipsis">{{ nurseName(active.nurseId) }}</span>
          <q-space />
          <span class="q-ml-sm">{{ formatMDW(days[active.day]?.date ?? '') }}</span>
        </div>
        <div class="picker-grid" role="group" aria-label="選擇班別">
          <button
            v-for="c in SHIFT_CODES"
            :key="c"
            type="button"
            class="picker-btn"
            :class="[SHIFT_META[c].cls, { selected: c === codeAt(active.nurseId, active.day) }]"
            :aria-pressed="c === codeAt(active.nurseId, active.day)"
            :aria-label="`${SHIFT_META[c].label}（${c}）${KEY_HINT[c] ? `，快捷鍵 ${KEY_HINT[c]}` : ''}`"
            @click="pickFromMenu(c)"
          >
            <span class="picker-code">{{ c }}</span>
            <span class="picker-label">{{ SHIFT_META[c].label }}</span>
            <span v-if="KEY_HINT[c]" class="picker-key" aria-hidden="true">{{ KEY_HINT[c] }}</span>
          </button>
        </div>
        <q-separator class="q-my-xs" />
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          color="muted"
          :icon="isLocked(active.nurseId, active.day) ? 'lock_open' : 'lock'"
          :label="isLocked(active.nurseId, active.day) ? '解除鎖定' : '鎖定'"
          @click="toggleLock"
        >
          <q-tooltip>鎖定的格子在自動排班時保持不變</q-tooltip>
        </q-btn>
      </div>
    </q-menu>

    <!-- Day header menu -->
    <q-menu v-model="dayMenu.open" :target="dayMenu.target" no-parent-event @hide="dayMenu.target = false">
      <q-list dense style="min-width: 180px">
        <q-item-label header class="q-py-sm">{{ dayMenu.day !== null ? formatMDW(days[dayMenu.day]?.date ?? '') : '' }}</q-item-label>
        <q-item v-close-popup clickable @click="dayMenu.day !== null && emit('toggle-holiday', dayMenu.day)">
          <q-item-section avatar><q-icon name="celebration" /></q-item-section>
          <q-item-section>
            {{ dayMenu.day !== null && days[dayMenu.day]?.isHoliday ? '取消國定假日' : '設為國定假日' }}
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>

    <!-- Row menu -->
    <q-menu v-model="rowMenu.open" :target="rowMenu.target" no-parent-event @hide="rowMenu.target = false">
      <q-list dense style="min-width: 180px">
        <q-item-label header class="q-py-sm">{{ rowMenu.nurseId ? nurseName(rowMenu.nurseId) : '' }}</q-item-label>
        <q-item v-close-popup clickable class="text-negative" @click="rowMenu.nurseId && emit('remove-row', rowMenu.nurseId)">
          <q-item-section avatar><q-icon name="person_remove" color="negative" /></q-item-section>
          <q-item-section>自班表移除</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, watch } from 'vue';
import LevelBadge from '@/components/LevelBadge.vue';
import { scrollBehavior } from '@/composables/useMotion';
import { SHIFT_META, WEEKDAY_LABELS } from '@/constants/labels';
import { SHIFT_CODES, isWorkShift, type DayInfo, type NurseSnapshot, type Schedule, type ShiftCode, type Violation, type WorkShift } from '@/types/schedule';
import { formatMD, formatMDW } from '@/utils/dates';
import type { EvaluationResult } from '@/utils/scheduler';

const props = withDefaults(
  defineProps<{
    schedule: Schedule;
    days: DayInfo[];
    rows: NurseSnapshot[];
    evaluation: EvaluationResult;
    editable: boolean;
    meId: string;
    showIssues: boolean;
    /** The six coverage rows at the bottom (managers need them; staff on phones do not). */
    showSummary?: boolean;
    /** Cell / row / column to highlight and scroll to. */
    focus: { nurseId?: string | undefined; day?: number | undefined; token: number } | null;
  }>(),
  { showSummary: true },
);

const emit = defineEmits<{
  'set-cell': [nurseId: string, day: number, code: ShiftCode];
  'set-lock': [nurseId: string, day: number, locked: boolean];
  'toggle-holiday': [day: number];
  'remove-row': [nurseId: string];
  'open-issues': [nurseId: string];
  swap: [day: number];
}>();

// Sizes in px at the default 16px root size, rendered in rem so the grid grows with the browser's text size.
const NAME_W = 112;
const LEVEL_W = 44;
const DAY_W = 40;
const STAT_W = 38;
const ISSUE_W = 34;
const rem = (px: number) => `${px / 16}rem`;
const tableWidth = computed(() => NAME_W + LEVEL_W + DAY_W * props.days.length + STAT_W * 3 + ISSUE_W);

/** Single-key shortcuts. Rare, multi-week leave (產假、陪產假) is picked from the menu instead. */
const KEY_TO_CODE: Record<string, ShiftCode> = {
  d: 'D',
  e: 'E',
  n: 'N',
  o: 'OFF',
  '0': 'OFF',
  a: 'AL',
  l: 'OL',
  r: 'REQ',
  s: 'SL',
  p: 'PL',
  m: 'MNL',
  c: 'CO',
  b: 'BL',
  w: 'WL',
  i: 'IL',
};
const KEY_HINT: Partial<Record<ShiftCode, string>> = {};
for (const [key, code] of Object.entries(KEY_TO_CODE)) if (!KEY_HINT[code]) KEY_HINT[code] = key.toUpperCase();
/** "D、E、N、O、…" for the keyboard help text. */
const KEY_LIST = Object.values(KEY_HINT).join('、');
const STAT_HEADS = [
  { key: 'work', label: '上班', title: '上班天數（D、E、N）' },
  { key: 'rest', label: '休', title: '休息日（OFF、預假）' },
  { key: 'leave', label: '假', title: '請假天數（年休、公假、病假、事假等）' },
] as const;

const hintId = useId();
const scroller = ref<HTMLElement | null>(null);

const keyboardHint = computed(() =>
  props.editable
    ? `方向鍵移動；Enter 開啟班別選單；直接輸入 ${KEY_LIST} 設定班別或假別；Delete 改為休假；Command 或 Ctrl 加 Z 復原。`
    : '方向鍵移動；在自己的上班日按 Enter 申請換班。',
);

const weeks = computed(() => {
  const out: { index: number; length: number; range: string }[] = [];
  for (let i = 0; i < props.days.length; i += 7) {
    const slice = props.days.slice(i, i + 7);
    out.push({
      index: i / 7,
      length: slice.length,
      range: `${formatMD(slice[0]!.date)}–${formatMD(slice[slice.length - 1]!.date)}`,
    });
  }
  return out;
});

const issuesByNurse = computed(() => {
  const map: Record<string, { list: Violation[]; errors: number; warnings: number }> = {};
  for (const v of props.evaluation.violations) {
    if (!v.nurseId || v.severity === 'info') continue;
    const entry = (map[v.nurseId] ??= { list: [], errors: 0, warnings: 0 });
    entry.list.push(v);
    if (v.severity === 'error') entry.errors++;
    else entry.warnings++;
  }
  return map;
});

const lockSets = computed(() => {
  const map: Record<string, Set<number>> = {};
  for (const [id, days] of Object.entries(props.schedule.locks ?? {})) map[id] = new Set(days);
  return map;
});

function codeAt(nurseId: string, day: number): ShiftCode {
  return props.schedule.assignments[nurseId]?.[day] ?? 'OFF';
}

function isLocked(nurseId: string, day: number): boolean {
  return lockSets.value[nurseId]?.has(day) ?? false;
}

function nurseName(id: string): string {
  return props.schedule.nurses[id]?.name ?? id;
}

function severityAt(nurseId: string, day: number) {
  return props.showIssues ? props.evaluation.cellSeverity[`${nurseId}|${day}`] : undefined;
}

// ---------------------------------------------------------------------------
// Accessible names
// ---------------------------------------------------------------------------

function dayLabel(d: DayInfo): string {
  return `${formatMDW(d.date)}${d.isHoliday ? '，國定假日' : ''}`;
}

function nameLabel(n: NurseSnapshot): string {
  return `${n.name}${n.employeeId ? `，${n.employeeId}` : ''}，${n.level}${n.id === props.meId ? '，我' : ''}`;
}

function cellLabel(n: NurseSnapshot, d: DayInfo): string {
  const code = codeAt(n.id, d.index);
  const sev = severityAt(n.id, d.index);
  const parts = [n.name, formatMDW(d.date), SHIFT_META[code].label];
  if (isLocked(n.id, d.index)) parts.push('已鎖定');
  if (sev === 'error') parts.push('違規');
  else if (sev === 'warning') parts.push('警告');
  if (!props.editable && n.id === props.meId && isWorkShift(code)) parts.push('可申請換班');
  return parts.join('，');
}

function issueLabel(nurseId: string): string {
  if (!props.showIssues) return '未標示違規';
  const i = issuesByNurse.value[nurseId];
  if (!i) return '沒有違規';
  return `${i.errors} 項錯誤、${i.warnings} 項警告`;
}

function sumLabel(s: SummaryRow, d: DayInfo): string {
  const sev = props.showIssues ? props.evaluation.daySeverity[`${s.sevKey}|${d.index}`] : undefined;
  const demand = s.demand ? `，需 ${s.demand[d.index]}` : '';
  const flag = sev === 'error' ? '，不足' : sev === 'warning' ? '，警告' : '';
  return `${formatMDW(d.date)} ${s.full} ${s.values[d.index]}${demand}${flag}`;
}

// ---------------------------------------------------------------------------
// Keyboard focus: one tab stop (roving tabindex), arrow keys move inside the grid.
//
// Rows: -1 = date header, 0..R-1 = nurses, R.. = coverage summary.
// Columns: -1 = name, 0..D-1 = days, D..D+2 = statistics, D+3 = rule check.
// ---------------------------------------------------------------------------

const R = computed(() => props.rows.length);
const D = computed(() => props.days.length);
const lastRow = computed(() => R.value + (props.showSummary ? summaryRows.value.length : 0) - 1);
const focusPos = ref({ r: 0, c: 0 });

const pos = (r: number, c: number) => `${r}:${c}`;
const minC = (r: number) => (r < 0 ? 0 : -1);
const maxC = (r: number) => (r >= R.value ? D.value : D.value + 3);

function clampPos(r: number, c: number): { r: number; c: number } {
  const rr = Math.max(-1, Math.min(lastRow.value, r));
  return { r: rr, c: Math.max(minC(rr), Math.min(maxC(rr), c)) };
}

const tabPos = computed(() => clampPos(focusPos.value.r, focusPos.value.c));
const ti = (r: number, c: number) => (tabPos.value.r === r && tabPos.value.c === c ? 0 : -1);
const isBody = (r: number, c: number) => r >= 0 && r < R.value && c >= 0 && c < D.value;

function elAt(r: number, c: number): HTMLElement | null {
  return scroller.value?.querySelector<HTMLElement>(`[data-pos="${pos(r, c)}"]`) ?? null;
}

function parsePos(el: HTMLElement | null): { r: number; c: number } | null {
  const raw = el?.dataset.pos;
  if (!raw) return null;
  const [r, c] = raw.split(':').map(Number);
  return r === undefined || c === undefined ? null : { r, c };
}

function moveFocus(r: number, c: number): void {
  const p = clampPos(r, c);
  focusPos.value = p;
  void nextTick(() => {
    const el = elAt(p.r, p.c);
    if (!el) return;
    el.focus({ preventScroll: true });
    // scroll-padding on the scroller keeps the cell clear of the sticky header, names and summary.
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function onFocusIn(ev: FocusEvent): void {
  const p = parsePos((ev.target as HTMLElement).closest<HTMLElement>('[data-pos]'));
  if (p) focusPos.value = p;
}

/** Enter, Space, F2 or a click. */
function activate(r: number, c: number, el: HTMLElement): void {
  if (r === -1 && c >= 0 && c < D.value) {
    if (props.editable) openMenu(dayMenu, el, () => (dayMenu.day = c));
  } else if (r >= 0 && r < R.value && c === -1) {
    const id = props.rows[r]!.id;
    if (props.editable) openMenu(rowMenu, el, () => (rowMenu.nurseId = id));
  } else if (isBody(r, c)) {
    const id = props.rows[r]!.id;
    if (props.editable) {
      openMenu(cellMenu, el, () => (active.value = { nurseId: id, day: c }));
    } else if (id === props.meId && isWorkShift(codeAt(id, c))) {
      emit('swap', c);
    }
  } else if (r >= 0 && r < R.value && c === D.value + 3) {
    if (props.showIssues && issuesByNurse.value[props.rows[r]!.id]) emit('open-issues', props.rows[r]!.id);
  }
}

function setCode(nurseId: string, day: number, code: ShiftCode): void {
  // Re-picking the current code on an unlocked cell locks it (manual edits are always locked).
  if (code !== codeAt(nurseId, day) || !isLocked(nurseId, day)) emit('set-cell', nurseId, day, code);
}

function onGridKeydown(ev: KeyboardEvent): void {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-pos]');
  const p = parsePos(el);
  if (!el || !p) return;
  clearJump();
  if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
  const { r, c } = p;

  const moves: Record<string, [number, number]> = {
    ArrowUp: [r - 1, c],
    ArrowDown: [r + 1, c],
    ArrowLeft: [r, c - 1],
    ArrowRight: [r, c + 1],
    Home: [r, minC(r)],
    End: [r, maxC(r)],
    PageUp: [r - 10, c],
    PageDown: [r + 10, c],
  };
  const move = moves[ev.key];
  if (move) {
    ev.preventDefault();
    moveFocus(...move);
    return;
  }
  if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'F2') {
    ev.preventDefault();
    activate(r, c, el);
    return;
  }

  if (!props.editable || !isBody(r, c)) return;
  const id = props.rows[r]!.id;
  const code = KEY_TO_CODE[ev.key.toLowerCase()];
  if (code) {
    ev.preventDefault();
    setCode(id, c, code);
    moveFocus(r, Math.min(c + 1, D.value - 1));
  } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault();
    setCode(id, c, 'OFF');
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

type MenuState = { open: boolean; target: HTMLElement | false };
const active = ref<{ nurseId: string; day: number } | null>(null);
const cellMenu = reactive<MenuState>({ open: false, target: false });
const dayMenu = reactive<MenuState & { day: number | null }>({ open: false, target: false, day: null });
const rowMenu = reactive<MenuState & { nurseId: string | null }>({ open: false, target: false, nurseId: null });

/** Why the cell menu closed: after a pick or Escape, focus returns to the grid; after an outside click it does not. */
let cellMenuReturn: 'grid' | 'none' = 'none';

function openMenu(menu: MenuState, el: HTMLElement, prepare: () => void): void {
  prepare();
  menu.open = false;
  menu.target = el;
  void nextTick(() => (menu.open = true));
}

function pickFromMenu(code: ShiftCode, advance = false): void {
  if (!active.value) return;
  const { nurseId, day } = active.value;
  setCode(nurseId, day, code);
  const r = props.rows.findIndex((n) => n.id === nurseId);
  focusPos.value = clampPos(r, advance ? Math.min(day + 1, D.value - 1) : day);
  cellMenuReturn = 'grid';
  cellMenu.open = false;
}

function toggleLock(): void {
  if (!active.value) return;
  const { nurseId, day } = active.value;
  emit('set-lock', nurseId, day, !isLocked(nurseId, day));
  cellMenuReturn = 'grid';
  cellMenu.open = false;
}

function onPickerKeydown(ev: KeyboardEvent): void {
  if (!active.value || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const key = ev.key.toLowerCase();
  const arrows: Record<string, [number, number]> = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
  if (arrows[key]) {
    ev.preventDefault();
    const r = props.rows.findIndex((n) => n.id === active.value!.nurseId);
    cellMenu.open = false;
    moveFocus(r + arrows[key][0], active.value.day + arrows[key][1]);
  } else if (KEY_TO_CODE[key]) {
    ev.preventDefault();
    pickFromMenu(KEY_TO_CODE[key], true);
  } else if (key === 'delete' || key === 'backspace') {
    ev.preventDefault();
    pickFromMenu('OFF');
  } else if (key === 'escape') {
    cellMenuReturn = 'grid';
  }
}

function onCellMenuHide(): void {
  cellMenu.target = false;
  if (cellMenuReturn === 'grid') moveFocus(focusPos.value.r, focusPos.value.c);
  cellMenuReturn = 'none';
}

// ---------------------------------------------------------------------------
// Jump target from the rule-check panel: a static ring that stays until the next interaction.
// ---------------------------------------------------------------------------

const jumpNurse = ref<string | null>(null);
const jumpDay = ref<number | null>(null);

function clearJump(): void {
  jumpNurse.value = null;
  jumpDay.value = null;
}

watch(
  () => props.focus?.token,
  async () => {
    const f = props.focus;
    if (!f) return;
    jumpNurse.value = f.nurseId ?? null;
    jumpDay.value = f.day ?? null;
    await nextTick();
    let target: { r: number; c: number } | null = null;
    if (f.nurseId) {
      const r = props.rows.findIndex((n) => n.id === f.nurseId);
      if (r >= 0) target = { r, c: f.day ?? -1 };
    } else if (f.day !== undefined) {
      target = { r: -1, c: f.day };
    }
    if (!target) return;
    focusPos.value = target;
    const el = elAt(target.r, target.c);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: scrollBehavior() });
  },
);

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

function cellClass(nurseId: string, day: number): (string | Record<string, boolean>)[] {
  const code = codeAt(nurseId, day);
  const sev = severityAt(nurseId, day);
  return [
    SHIFT_META[code].cls,
    {
      'week-start': day % 7 === 0,
      locked: isLocked(nurseId, day),
      'cell-error': sev === 'error',
      'cell-warning': sev === 'warning',
      'cell-active': cellMenu.open && active.value?.nurseId === nurseId && active.value?.day === day,
      'cell-jump': jumpDay.value === day && (jumpNurse.value === nurseId || jumpNurse.value === null),
      clickable: props.editable || (nurseId === props.meId && isWorkShift(code)),
    },
  ];
}

function sumClass(key: string, day: number): string {
  const sev = props.showIssues ? props.evaluation.daySeverity[`${key}|${day}`] : undefined;
  return sev === 'error' ? 'sum-error' : sev === 'warning' ? 'sum-warning' : '';
}

interface SummaryRow {
  key: string;
  sevKey: string;
  label: string;
  full: string;
  short: string;
  pill: string;
  values: number[];
  demand: number[] | null;
}

const summaryRows = computed<SummaryRow[]>(() => {
  const e = props.evaluation;
  const row = (key: WorkShift, label: string): SummaryRow => ({
    key,
    sevKey: key,
    label,
    full: `${label}人數`,
    short: key,
    pill: SHIFT_META[key].cls,
    values: e.cover[key],
    demand: e.demand[key] as number[] | null,
  });
  const senior = (key: WorkShift, label: string, name: string): SummaryRow => ({
    key: `S${key}`,
    sevKey: `S${key}`,
    label,
    full: `${name}資深人力`,
    short: '2+',
    pill: SHIFT_META[key].cls,
    values: e.senior[key],
    demand: null,
  });
  return [row('D', '白班'), row('E', '小夜'), row('N', '大夜'), senior('D', 'N2+ 白', '白班'), senior('E', 'N2+ 小', '小夜'), senior('N', 'N2+ 大', '大夜')];
});

function demandRange(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min}` : `${min}–${max}`;
}
</script>

<style scoped lang="scss">
@use 'sass:math';

@function r($px) {
  @return math.div($px, 16) * 1rem;
}

.roster-scroll {
  overflow: auto;
  max-height: calc(100vh - var(--roster-offset, 268px));
  max-height: calc(100dvh - var(--roster-offset, 268px));
  min-height: 320px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  overscroll-behavior: contain;
  // Keyboard-reached cells stay clear of the sticky header and name columns…
  scroll-padding: r(66) 0 0 r(156);
  // …and of the sticky coverage summary.
  &.has-summary {
    scroll-padding-bottom: r(146);
  }
  // On phones the page scrolls; the grid takes most of the screen instead of a viewport-minus-toolbar guess.
  @media (max-width: 1023px) {
    max-height: 72vh;
    max-height: 72dvh;
  }
}

.roster {
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: r(12);

  th,
  td {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 0;
    text-align: center;
    white-space: nowrap;
  }
}

thead {
  position: sticky;
  top: 0;
  z-index: 4;
  th {
    background: var(--surface-2);
    font-weight: 600;
    color: var(--text-2);
  }
}

tfoot {
  position: sticky;
  bottom: 0;
  z-index: 4;
}

.sticky-l1,
.sticky-l2 {
  position: sticky;
  z-index: 3;
  background: var(--surface);
}
.sticky-l1 {
  left: 0;
}
.sticky-l2 {
  left: r(112);
  box-shadow: 2px 0 0 var(--line);
}
thead .sticky-l1,
thead .sticky-l2,
tfoot .sticky-l1 {
  z-index: 5;
  background: var(--surface-2);
}

.week-row th {
  height: r(26);
}
.week-range {
  font-weight: 400;
  color: var(--text-3);
  margin-left: 4px;
}
.date-row th {
  height: r(40);
}
.day-head {
  line-height: 1.15;
  &.weekend,
  &.holiday {
    background: var(--weekend-bg);
    color: var(--weekend-fg);
  }
  &.clickable {
    cursor: pointer;
  }
  &.col-jump {
    box-shadow: inset 0 -3px 0 var(--focus);
  }
}
.day-num {
  font-size: r(13);
  font-weight: 700;
}
.day-dow {
  font-size: r(11);
  font-weight: 500;
}
.hol-mark {
  display: inline-block;
  margin-left: 2px;
  padding: 0 2px;
  border: 1px solid currentColor;
  border-radius: 3px;
  font-size: r(11);
  line-height: 1.1;
  font-weight: 600;
}

.week-start {
  border-left: 2px solid var(--line-strong) !important;
}
.stat-sep {
  border-left: 2px solid var(--line-strong) !important;
}

.name-cell {
  text-align: left !important;
  padding: 2px 8px !important;
  font-weight: inherit;
  &.clickable {
    cursor: pointer;
  }
  .name {
    font-size: r(13);
    font-weight: 600;
    color: var(--text);
  }
  .emp {
    font-size: r(11);
    color: var(--text-3);
  }
  &.row-jump {
    box-shadow: inset 3px 0 0 var(--focus);
  }
}
.me-icon {
  color: var(--focus);
}
.level-cell {
  vertical-align: middle;
}

tbody tr {
  height: r(36);
  @media (max-width: 1023px) {
    height: r(40);
  }
}
@media (hover: hover) {
  tbody tr:hover td {
    filter: brightness(0.97);
  }
}
.row-me .name-cell,
.row-me .level-cell {
  background: var(--tint);
}

// Focus ring for every navigable header / statistic / summary cell.
.nav {
  outline: none;
  &:not(.cell):focus {
    box-shadow: inset 0 0 0 2px var(--focus);
  }
}

// Shift cells layer several rings; each lives in its own custom property so they combine.
.cell {
  --ring-focus: 0 0 transparent;
  --ring-jump: 0 0 transparent;
  --ring-error: 0 0 transparent;
  --ring-hover: 0 0 transparent;
  --ring-me: 0 0 transparent;
  box-shadow: var(--ring-focus), var(--ring-jump), var(--ring-error), var(--ring-hover), var(--ring-me);
  font-weight: 700;
  font-size: r(12);
  position: relative;
  user-select: none;

  &.shift-off {
    font-weight: 500;
    font-size: r(11);
    color: var(--off-cell) !important;
    background: var(--surface) !important;
  }
  &.clickable {
    cursor: pointer;
  }
  @media (hover: hover) {
    &.clickable:hover {
      --ring-hover: inset 0 0 0 2px color-mix(in srgb, var(--focus) 50%, transparent);
    }
  }
  // Locked: a corner triangle (shape, not colour).
  &.locked::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    border-style: solid;
    border-width: 0 8px 8px 0;
    border-color: transparent var(--text-3) transparent transparent;
  }
  // Error: solid ring plus a dot in the top-left corner.
  &.cell-error {
    --ring-error: inset 0 0 0 2px var(--error);
    &::before {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--error);
    }
    &.shift-off {
      background: var(--error-soft) !important;
    }
  }
  // Warning: dashed ring.
  &.cell-warning {
    outline: 2px dashed var(--warn);
    outline-offset: -3px;
  }
  &:focus,
  &.cell-active {
    --ring-focus: 0 0 0 2px var(--focus), inset 0 0 0 1px var(--surface);
    z-index: 2;
  }
  &.cell-jump {
    --ring-jump: inset 0 0 0 3px var(--focus);
  }
}
.row-me .cell {
  --ring-me: inset 0 2px 0 color-mix(in srgb, var(--focus) 40%, transparent), inset 0 -2px 0 color-mix(in srgb, var(--focus) 40%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .cell {
    transition: box-shadow 0.15s;
  }
  .cell.cell-jump {
    animation: pulse 1.2s ease-in-out 2;
  }
  @keyframes pulse {
    50% {
      filter: brightness(0.9);
    }
  }
}

@media (forced-colors: active) {
  .nav:focus,
  .cell:focus {
    outline: 2px solid CanvasText;
    outline-offset: -2px;
  }
  .cell-error::before {
    background: CanvasText;
  }
}

.stat-col {
  font-size: r(12);
  color: var(--text-2);
}
.issue-col {
  vertical-align: middle;
  &.clickable {
    cursor: pointer;
  }
}

.empty-row {
  text-align: left !important;
  white-space: normal !important;
}
.empty-row-inner {
  position: sticky;
  left: 0;
  width: min(100%, 22rem);
  padding: 24px 16px;
  color: var(--text-2);
  font-size: r(14);
}

tfoot {
  th,
  td {
    background: var(--surface-2);
    height: r(24);
    font-size: r(12);
  }
  .sum-first th,
  .sum-first td {
    border-top: 2px solid var(--line-strong);
  }
  .sum-senior-first th,
  .sum-senior-first td {
    border-top: 1px dashed var(--line-strong);
  }
}
.sum-label {
  text-align: left !important;
  padding-left: 8px !important;
  font-weight: 600;
  color: var(--text-2);
}
.sum-pill {
  min-width: r(22);
  height: r(18);
  font-size: r(11);
}
.sum-cell {
  font-weight: 600;
  color: var(--text);
}
// Coverage problems: colour plus underline style (solid = shortage, dotted = warning).
.sum-error {
  background: var(--error-soft) !important;
  color: var(--error) !important;
  text-decoration: underline solid 2px;
  text-underline-offset: 3px;
}
.sum-warning {
  background: var(--warn-soft) !important;
  color: var(--on-warn) !important;
  text-decoration: underline dotted 2px;
  text-underline-offset: 3px;
}
.sum-tail {
  font-size: r(11);
  text-align: left !important;
  padding-left: 6px !important;
  color: var(--text-3);
}

.picker {
  width: r(236);
}
.picker-title {
  font-size: r(12);
  color: var(--text-2);
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.picker-btn {
  border: 0;
  border-radius: 8px;
  min-height: 44px;
  padding: 6px 2px 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  font-family: inherit;
  &:hover {
    filter: brightness(0.95);
  }
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  &.selected {
    outline: 2px solid var(--focus);
  }
}
.picker-code {
  font-weight: 800;
  font-size: r(13);
}
.picker-label {
  font-size: r(11);
}
.picker-key {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: r(10);
  font-weight: 600;
}
</style>
