<template>
  <div ref="scroller" class="roster-scroll">
    <table class="roster" :style="{ width: `${tableWidth}px` }">
      <colgroup>
        <col :style="{ width: `${NAME_W}px` }" />
        <col :style="{ width: `${LEVEL_W}px` }" />
        <col v-for="d in days" :key="d.index" :style="{ width: `${DAY_W}px` }" />
        <col v-for="i in 3" :key="`s${i}`" :style="{ width: `${STAT_W}px` }" />
        <col :style="{ width: `${ISSUE_W}px` }" />
      </colgroup>

      <thead>
        <tr class="week-row">
          <th class="sticky-l1 corner" rowspan="2">人員</th>
          <th class="sticky-l2 corner" rowspan="2">職級</th>
          <th v-for="w in weeks" :key="w.index" :colspan="w.length" class="week-head week-start">
            第 {{ w.index + 1 }} 週
            <span class="week-range">{{ w.range }}</span>
          </th>
          <th colspan="3" class="week-head stat-sep">統計</th>
          <th rowspan="2" class="issue-head"><q-icon name="rule" size="16px" /></th>
        </tr>
        <tr class="date-row">
          <th
            v-for="d in days"
            :key="d.index"
            class="day-head"
            :class="{
              'week-start': d.index % 7 === 0,
              weekend: d.isWeekend,
              holiday: d.isHoliday,
              clickable: editable,
              'col-focus': focusDay === d.index,
            }"
            @click="openDayMenu($event, d)"
          >
            <div class="day-num">{{ d.date.slice(8, 10) }}</div>
            <div class="day-dow">{{ WEEKDAY_LABELS[d.dow] }}</div>
          </th>
          <th class="stat-col stat-sep">上班</th>
          <th class="stat-col">休</th>
          <th class="stat-col">假</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="nurse in rows" :key="nurse.id" :class="{ 'row-me': nurse.id === meId }">
          <td
            class="sticky-l1 name-cell"
            :class="{ clickable: editable, 'row-focus': focusNurse === nurse.id && focusDay === null }"
            @click="openRowMenu($event, nurse.id)"
          >
            <div class="name ellipsis">
              {{ nurse.name }}
              <q-icon v-if="nurse.id === meId" name="person_pin" size="13px" color="primary" />
            </div>
            <div class="emp ellipsis">{{ nurse.employeeId }}</div>
          </td>
          <td class="sticky-l2 level-cell"><LevelBadge :level="nurse.level" /></td>
          <td
            v-for="d in days"
            :key="d.index"
            :data-cell="`${nurse.id}|${d.index}`"
            class="cell"
            :class="cellClass(nurse.id, d.index)"
            @click="onCellClick($event, nurse.id, d.index)"
          >
            {{ codeAt(nurse.id, d.index) === 'OFF' ? 'OFF' : codeAt(nurse.id, d.index) }}
          </td>
          <td class="stat-col stat-sep tabular">{{ evaluation.nurseStats[nurse.id]?.work ?? 0 }}</td>
          <td class="stat-col tabular">{{ evaluation.nurseStats[nurse.id]?.rest ?? 0 }}</td>
          <td class="stat-col tabular">{{ evaluation.nurseStats[nurse.id]?.leave ?? 0 }}</td>
          <td class="issue-col">
            <template v-if="showIssues && issuesByNurse[nurse.id]?.length">
              <q-icon
                :name="(evaluation.nurseStats[nurse.id]?.errors ?? 0) > 0 ? 'error' : 'warning'"
                :color="(evaluation.nurseStats[nurse.id]?.errors ?? 0) > 0 ? 'negative' : 'warning'"
                size="17px"
              >
                <q-tooltip max-width="320px">
                  <div v-for="(v, i) in issuesByNurse[nurse.id]" :key="i">• {{ v.message }}</div>
                </q-tooltip>
              </q-icon>
            </template>
            <q-icon v-else-if="showIssues" name="check_circle" color="positive" size="15px" class="ok-icon" />
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="days.length + 6" class="text-center text-grey-6 q-pa-lg">—</td>
        </tr>
      </tbody>

      <tfoot>
        <tr v-for="(s, i) in summaryRows" :key="s.key" :class="{ 'sum-first': i === 0, 'sum-senior-first': s.key === 'SD' }">
          <th class="sticky-l1 sum-label" colspan="2">
            <span class="shift-pill" :class="s.pill" style="min-width: 22px; height: 18px; font-size: 10px">{{ s.short }}</span>
            <span class="q-ml-xs">{{ s.label }}</span>
          </th>
          <td
            v-for="d in days"
            :key="d.index"
            class="sum-cell tabular"
            :class="[sumClass(s.sevKey, d.index), { 'week-start': d.index % 7 === 0 }]"
            :title="s.demand ? `${s.values[d.index]}/${s.demand[d.index]}` : `${s.values[d.index]}`"
          >
            {{ s.values[d.index] }}
          </td>
          <td colspan="4" class="sum-tail stat-sep">
            <span v-if="s.demand" class="text-grey-6">需 {{ demandRange(s.demand) }}</span>
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Cell editor -->
    <q-menu
      v-model="cellMenu.open"
      :target="cellMenu.target"
      no-parent-event
      anchor="bottom middle"
      self="top middle"
      :offset="[0, 4]"
      @hide="cellMenu.target = false"
    >
      <div v-if="active" class="picker q-pa-sm">
        <div class="text-caption text-grey-7 q-px-xs q-mb-xs row items-center no-wrap">
          <span class="ellipsis">{{ nurseName(active.nurseId) }}</span>
          <q-space />
          <span class="q-ml-sm">{{ formatMDW(days[active.day]?.date ?? '') }}</span>
        </div>
        <div class="picker-grid">
          <button
            v-for="c in SHIFT_CODES"
            :key="c"
            type="button"
            class="picker-btn"
            :class="[SHIFT_META[c].cls, { selected: c === codeAt(active.nurseId, active.day) }]"
            @click="pick(c)"
          >
            <span class="picker-code">{{ c }}</span>
            <span class="picker-label">{{ SHIFT_META[c].label }}</span>
            <span class="picker-key">{{ KEY_HINT[c] }}</span>
          </button>
        </div>
        <q-separator class="q-my-xs" />
        <div class="row items-center">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            :icon="isLocked(active.nurseId, active.day) ? 'lock_open' : 'lock'"
            :label="isLocked(active.nurseId, active.day) ? '解除鎖定' : '鎖定'"
            color="grey-8"
            @click="toggleLock"
          >
            <q-tooltip>鎖定的格子在自動排班時保持不變</q-tooltip>
          </q-btn>
        </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import LevelBadge from '@/components/LevelBadge.vue';
import { SHIFT_META, WEEKDAY_LABELS } from '@/constants/labels';
import { SHIFT_CODES, isWorkShift, type DayInfo, type NurseSnapshot, type Schedule, type ShiftCode, type Violation, type WorkShift } from '@/types/schedule';
import { formatMD, formatMDW } from '@/utils/dates';
import type { EvaluationResult } from '@/utils/scheduler';

const props = defineProps<{
  schedule: Schedule;
  days: DayInfo[];
  rows: NurseSnapshot[];
  evaluation: EvaluationResult;
  editable: boolean;
  meId: string;
  showIssues: boolean;
  /** Cell / row / column to highlight and scroll to. */
  focus: { nurseId?: string | undefined; day?: number | undefined; token: number } | null;
}>();

const emit = defineEmits<{
  'set-cell': [nurseId: string, day: number, code: ShiftCode];
  'set-lock': [nurseId: string, day: number, locked: boolean];
  'toggle-holiday': [day: number];
  'remove-row': [nurseId: string];
  swap: [day: number];
}>();

const NAME_W = 112;
const LEVEL_W = 44;
const DAY_W = 40;
const STAT_W = 38;
const ISSUE_W = 34;
const tableWidth = computed(() => NAME_W + LEVEL_W + DAY_W * props.days.length + STAT_W * 3 + ISSUE_W);

const KEY_HINT: Record<ShiftCode, string> = { D: 'D', E: 'E', N: 'N', OFF: 'O', AL: 'A', OL: 'L', REQ: 'R' };
const KEY_TO_CODE: Record<string, ShiftCode> = { d: 'D', e: 'E', n: 'N', o: 'OFF', '0': 'OFF', a: 'AL', l: 'OL', r: 'REQ' };

const scroller = ref<HTMLElement | null>(null);

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
  const map: Record<string, Violation[]> = {};
  for (const v of props.evaluation.violations) {
    if (!v.nurseId || v.severity === 'info') continue;
    (map[v.nurseId] ??= []).push(v);
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

// ---------------------------------------------------------------------------
// Focus / selection
// ---------------------------------------------------------------------------

const active = ref<{ nurseId: string; day: number } | null>(null);
const focusNurse = ref<string | null>(null);
const focusDay = ref<number | null>(null);

watch(
  () => props.focus?.token,
  async () => {
    const f = props.focus;
    focusNurse.value = f?.nurseId ?? null;
    focusDay.value = f?.day ?? null;
    await nextTick();
    const el =
      f?.nurseId !== undefined && f?.day !== undefined
        ? scroller.value?.querySelector(`[data-cell="${CSS.escape(`${f.nurseId}|${f.day}`)}"]`)
        : f?.day !== undefined
          ? scroller.value?.querySelector(`[data-cell$="|${f.day}"]`)
          : f?.nurseId
            ? scroller.value?.querySelector(`[data-cell="${CSS.escape(`${f.nurseId}|0`)}"]`)
            : null;
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  },
);

function cellClass(nurseId: string, day: number): (string | Record<string, boolean>)[] {
  const code = codeAt(nurseId, day);
  const sev = props.showIssues ? props.evaluation.cellSeverity[`${nurseId}|${day}`] : undefined;
  return [
    SHIFT_META[code].cls,
    {
      'week-start': day % 7 === 0,
      locked: isLocked(nurseId, day),
      'cell-error': sev === 'error',
      'cell-warning': sev === 'warning',
      'cell-active': active.value?.nurseId === nurseId && active.value?.day === day,
      'cell-focus':
        (focusNurse.value === nurseId && focusDay.value === day) ||
        (focusNurse.value === null && focusDay.value === day),
      clickable: props.editable || (nurseId === props.meId && isWorkShift(code)),
    },
  ];
}

function sumClass(key: string, day: number): string {
  const sev = props.showIssues ? props.evaluation.daySeverity[`${key}|${day}`] : undefined;
  return sev === 'error' ? 'sum-error' : sev === 'warning' ? 'sum-warning' : '';
}

const summaryRows = computed(() => {
  const e = props.evaluation;
  const row = (key: WorkShift, label: string) => ({ key, sevKey: key, label, short: key, pill: SHIFT_META[key].cls, values: e.cover[key], demand: e.demand[key] as number[] | null });
  const senior = (key: WorkShift, label: string) => ({ key: `S${key}`, sevKey: `S${key}`, label, short: '2+', pill: SHIFT_META[key].cls, values: e.senior[key], demand: null as number[] | null });
  return [
    row('D', '白班'),
    row('E', '小夜'),
    row('N', '大夜'),
    senior('D', 'N2+ 白'),
    senior('E', 'N2+ 小'),
    senior('N', 'N2+ 大'),
  ];
});

function demandRange(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min}` : `${min}–${max}`;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

const cellMenu = reactive<{ open: boolean; target: HTMLElement | false }>({ open: false, target: false });
const dayMenu = reactive<{ open: boolean; target: HTMLElement | false; day: number | null }>({ open: false, target: false, day: null });
const rowMenu = reactive<{ open: boolean; target: HTMLElement | false; nurseId: string | null }>({ open: false, target: false, nurseId: null });

function openMenuAt(menu: { open: boolean; target: HTMLElement | false }, el: HTMLElement): void {
  menu.open = false;
  menu.target = el;
  void nextTick(() => (menu.open = true));
}

function onCellClick(ev: MouseEvent, nurseId: string, day: number): void {
  if (props.editable) {
    active.value = { nurseId, day };
    openMenuAt(cellMenu, ev.currentTarget as HTMLElement);
  } else if (nurseId === props.meId && isWorkShift(codeAt(nurseId, day))) {
    emit('swap', day);
  }
}

function openDayMenu(ev: MouseEvent, d: DayInfo): void {
  if (!props.editable) return;
  dayMenu.day = d.index;
  openMenuAt(dayMenu, ev.currentTarget as HTMLElement);
}

function openRowMenu(ev: MouseEvent, nurseId: string): void {
  if (!props.editable) return;
  rowMenu.nurseId = nurseId;
  openMenuAt(rowMenu, ev.currentTarget as HTMLElement);
}

function pick(code: ShiftCode): void {
  if (!active.value) return;
  if (code !== codeAt(active.value.nurseId, active.value.day) || !isLocked(active.value.nurseId, active.value.day)) {
    emit('set-cell', active.value.nurseId, active.value.day, code);
  }
  cellMenu.open = false;
}

function toggleLock(): void {
  if (!active.value) return;
  const { nurseId, day } = active.value;
  emit('set-lock', nurseId, day, !isLocked(nurseId, day));
  cellMenu.open = false;
}

// ---------------------------------------------------------------------------
// Keyboard editing (managers): D/E/N/O/A/L/R, Delete → OFF, arrows move.
// ---------------------------------------------------------------------------

function moveActive(dRow: number, dDay: number): void {
  if (!active.value) return;
  const idx = props.rows.findIndex((r) => r.id === active.value!.nurseId);
  const nextRow = props.rows[Math.min(props.rows.length - 1, Math.max(0, idx + dRow))];
  const nextDay = Math.min(props.days.length - 1, Math.max(0, active.value.day + dDay));
  if (!nextRow) return;
  active.value = { nurseId: nextRow.id, day: nextDay };
  cellMenu.open = false;
  void nextTick(() =>
    scroller.value
      ?.querySelector(`[data-cell="${CSS.escape(`${nextRow.id}|${nextDay}`)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  );
}

function onKeydown(ev: KeyboardEvent): void {
  if (!props.editable || !active.value) return;
  const target = ev.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  // Never edit the grid behind an open dialog.
  if (document.querySelector('.q-dialog')) return;
  const key = ev.key.toLowerCase();
  const arrows: Record<string, [number, number]> = {
    arrowup: [-1, 0],
    arrowdown: [1, 0],
    arrowleft: [0, -1],
    arrowright: [0, 1],
  };
  if (arrows[key]) {
    ev.preventDefault();
    moveActive(...arrows[key]);
  } else if (KEY_TO_CODE[key]) {
    ev.preventDefault();
    pick(KEY_TO_CODE[key]);
    moveActive(0, 1);
  } else if (key === 'delete' || key === 'backspace') {
    ev.preventDefault();
    pick('OFF');
  } else if (key === 'escape') {
    cellMenu.open = false;
    active.value = null;
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped lang="scss">
$line: #e3e8ec;
$week-line: #8aa1b5;
$head-bg: #f7f9fa;

.roster-scroll {
  overflow: auto;
  max-height: calc(100vh - 220px);
  min-height: 320px;
  border: 1px solid $line;
  border-radius: 12px;
  background: #fff;
  outline: none;
  overscroll-behavior: contain;
}

.roster {
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12px;

  th,
  td {
    border-right: 1px solid $line;
    border-bottom: 1px solid $line;
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
    background: $head-bg;
    font-weight: 600;
    color: #52606d;
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
  background: #fff;
}
.sticky-l1 {
  left: 0;
}
.sticky-l2 {
  left: 112px;
  box-shadow: 2px 0 0 $line;
}
thead .sticky-l1,
thead .sticky-l2,
tfoot .sticky-l1 {
  z-index: 5;
  background: $head-bg;
}

.week-row th {
  height: 26px;
  font-size: 12px;
}
.week-range {
  font-weight: 400;
  color: #9aa5b1;
  margin-left: 4px;
}
.date-row th {
  height: 38px;
}
.day-head {
  line-height: 1.15;
  &.weekend {
    background: #fdf3ea;
    color: #b45309;
  }
  &.holiday {
    background: #fde8e8;
    color: #c0392b;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 3px;
      right: 3px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #c0392b;
    }
  }
  &.clickable {
    cursor: pointer;
    &:hover {
      filter: brightness(0.96);
    }
  }
  &.col-focus {
    box-shadow: inset 0 -3px 0 #0f6e72;
  }
}
.day-num {
  font-size: 13px;
  font-weight: 700;
}
.day-dow {
  font-size: 11px;
  font-weight: 500;
}

.week-start {
  border-left: 2px solid $week-line !important;
}
.stat-sep {
  border-left: 2px solid $week-line !important;
}

.name-cell {
  text-align: left !important;
  padding: 2px 8px !important;
  &.clickable {
    cursor: pointer;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: #1f2933;
  }
  .emp {
    font-size: 10px;
    color: #9aa5b1;
  }
  &.row-focus {
    box-shadow: inset 3px 0 0 #0f6e72;
  }
}
.level-cell {
  vertical-align: middle;
}

tbody tr {
  height: 34px;
}
tbody tr:hover td {
  filter: brightness(0.98);
}
.row-me .name-cell,
.row-me .level-cell {
  background: #e6f4f3;
}
.row-me .cell {
  box-shadow: inset 0 2px 0 rgba(15, 110, 114, 0.35), inset 0 -2px 0 rgba(15, 110, 114, 0.35);
}

.cell {
  font-weight: 700;
  font-size: 12px;
  position: relative;
  user-select: none;
  transition: box-shadow 0.15s;
  &.shift-off {
    font-weight: 500;
    font-size: 10px;
    color: #a0a9b3 !important;
    background: #fff !important;
  }
  &.clickable {
    cursor: pointer;
    &:hover {
      box-shadow: inset 0 0 0 2px rgba(15, 110, 114, 0.45);
    }
  }
  &.locked::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    border-style: solid;
    border-width: 0 7px 7px 0;
    border-color: transparent #6b7280 transparent transparent;
    opacity: 0.55;
  }
  &.cell-warning {
    box-shadow: inset 0 0 0 2px #f2a93b;
  }
  &.cell-error {
    box-shadow: inset 0 0 0 2px #e03131;
    &.shift-off {
      background: #fff0f0 !important;
    }
  }
  &.cell-active {
    box-shadow: inset 0 0 0 2px #0f6e72, 0 0 0 1px #0f6e72;
    z-index: 1;
  }
  &.cell-focus {
    animation: pulse 1.2s ease-in-out 3;
  }
}

@keyframes pulse {
  50% {
    box-shadow: inset 0 0 0 3px #0f6e72;
    filter: brightness(0.9);
  }
}

.stat-col {
  font-size: 12px;
  color: #52606d;
}
.issue-col {
  vertical-align: middle;
}
.ok-icon {
  opacity: 0.5;
}

tfoot {
  th,
  td {
    background: $head-bg;
    height: 24px;
    font-size: 12px;
  }
  .sum-first th,
  .sum-first td {
    border-top: 2px solid $week-line;
  }
  .sum-senior-first th,
  .sum-senior-first td {
    border-top: 1px dashed #c3ccd5;
  }
}
.sum-label {
  text-align: left !important;
  padding-left: 8px !important;
  font-weight: 600;
  color: #52606d;
}
.sum-cell {
  font-weight: 600;
  color: #3e4c59;
}
.sum-error {
  background: #ffe3e3 !important;
  color: #c92a2a !important;
}
.sum-warning {
  background: #fff4db !important;
  color: #b7791f !important;
}
.sum-tail {
  font-size: 11px;
  text-align: left !important;
  padding-left: 6px !important;
}

.picker {
  width: 236px;
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.picker-btn {
  border: 0;
  border-radius: 8px;
  padding: 6px 2px 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  font-family: inherit;
  &:hover {
    filter: brightness(0.95);
  }
  &.selected {
    outline: 2px solid #0f6e72;
  }
}
.picker-code {
  font-weight: 800;
  font-size: 13px;
}
.picker-label {
  font-size: 10px;
}
.picker-key {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 8px;
  opacity: 0.45;
}
</style>
