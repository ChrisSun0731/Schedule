<template>
  <section class="my-schedule surface" :aria-labelledby="titleId">
    <header class="my-head">
      <div class="my-who">
        <h2 :id="titleId" class="my-title">
          {{ nurse?.name ?? '' }}
          <LevelBadge v-if="nurse" :level="nurse.level" class="q-ml-xs" />
        </h2>
        <p class="my-next">
          <template v-if="next">
            下一班 <strong>{{ next.when }}</strong> {{ next.label }}
            <span v-if="next.time" class="tabular">{{ next.time }}</span>
          </template>
          <template v-else>本期已沒有上班日</template>
        </p>
      </div>
      <dl class="my-stats tabular">
        <div><dt>上班</dt><dd>{{ stats.work }}</dd></div>
        <div><dt>休</dt><dd>{{ stats.rest }}</dd></div>
        <div><dt>假</dt><dd>{{ stats.leave }}</dd></div>
      </dl>
    </header>

    <div class="cal-dow" aria-hidden="true">
      <span v-for="d in days.slice(0, 7)" :key="d.index">{{ WEEKDAY_LABELS[d.dow] }}</span>
    </div>

    <section v-for="w in weeks" :key="w.index" class="cal-week" :aria-label="`第 ${w.index + 1} 週，${w.range}`">
      <div class="cal-week-label" aria-hidden="true">第 {{ w.index + 1 }} 週 · {{ w.range }}</div>
      <ol class="cal-days">
        <li v-for="d in w.days" :key="d.index">
          <component
            :is="swappable(d) ? 'button' : 'div'"
            :type="swappable(d) ? 'button' : undefined"
            class="day"
            :class="[SHIFT_META[codeAt(d)].cls, { today: d.date === today, swappable: swappable(d) }]"
            :aria-label="dayLabel(d)"
            :aria-current="d.date === today ? 'date' : undefined"
            :role="swappable(d) ? undefined : 'img'"
            @click="swappable(d) && emit('swap', d.index)"
          >
            <span class="day-date" aria-hidden="true">
              <span class="day-num">{{ Number(d.date.slice(8, 10)) }}</span>
              <span v-if="d.isHoliday" class="hol-mark">假</span>
            </span>
            <span class="day-code" aria-hidden="true">{{ codeAt(d) }}</span>
            <span class="day-label" aria-hidden="true">{{ SHIFT_META[codeAt(d)].label }}</span>
          </component>
        </li>
      </ol>
    </section>

    <footer class="my-foot">
      <span v-for="s in WORK_SHIFTS" :key="s" class="row items-center no-wrap q-gutter-x-xs">
        <ShiftPill :code="s" dense :tooltip="false" />
        <span class="tabular">{{ shiftTime(s) }}</span>
      </span>
      <span v-if="canSwap" class="my-hint">點選今天以後的上班日，即可申請換班</span>
      <q-btn
        v-if="schedule.status === 'published'"
        flat
        dense
        no-caps
        color="primary"
        icon="event_available"
        label="加入 Google 日曆"
        :to="{ name: 'calendar', query: { schedule: schedule.id } }"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import LevelBadge from '@/components/LevelBadge.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { SHIFT_META, WEEKDAY_LABELS } from '@/constants/labels';
import { WORK_SHIFTS, isWorkShift, type DayInfo, type RuleConfig, type Schedule, type ShiftCode, type WorkShift } from '@/types/schedule';
import { addDays, formatMD, formatMDW, todayISO } from '@/utils/dates';
import type { EvaluationResult } from '@/utils/scheduler';

const props = defineProps<{
  schedule: Schedule;
  days: DayInfo[];
  nurseId: string;
  evaluation: EvaluationResult;
  rules: RuleConfig;
  /** Published schedule and the person may request swaps. */
  canSwap: boolean;
}>();

const emit = defineEmits<{ swap: [day: number] }>();

const titleId = useId();
const today = todayISO();
const nurse = computed(() => props.schedule.nurses[props.nurseId] ?? null);

function codeAt(d: DayInfo): ShiftCode {
  return props.schedule.assignments[props.nurseId]?.[d.index] ?? 'OFF';
}

function shiftTime(s: WorkShift): string {
  const t = props.rules.shiftTimes?.[s];
  return t ? `${t.start}–${t.end}` : '';
}

function swappable(d: DayInfo): boolean {
  return props.canSwap && d.date >= today && isWorkShift(codeAt(d));
}

function dayLabel(d: DayInfo): string {
  const code = codeAt(d);
  const parts = [`${formatMDW(d.date)}${d.date === today ? '（今天）' : ''}`, SHIFT_META[code].label];
  if (isWorkShift(code) && shiftTime(code)) parts.push(shiftTime(code));
  if (d.isHoliday) parts.push('國定假日');
  if (swappable(d)) parts.push('點選申請換班');
  return parts.join('，');
}

const weeks = computed(() => {
  const out: { index: number; range: string; days: DayInfo[] }[] = [];
  for (let i = 0; i < props.days.length; i += 7) {
    const slice = props.days.slice(i, i + 7);
    out.push({ index: i / 7, range: `${formatMD(slice[0]!.date)}–${formatMD(slice[slice.length - 1]!.date)}`, days: slice });
  }
  return out;
});

const stats = computed(() => {
  const s = props.evaluation.nurseStats[props.nurseId];
  return { work: s?.work ?? 0, rest: s?.rest ?? 0, leave: s?.leave ?? 0 };
});

/** The answer to "when do I work next?" */
const next = computed(() => {
  const d = props.days.find((x) => x.date >= today && isWorkShift(codeAt(x)));
  if (!d) return null;
  const code = codeAt(d) as WorkShift;
  const when = d.date === today ? '今天' : d.date === addDays(today, 1) ? '明天' : formatMDW(d.date);
  return { when, label: SHIFT_META[code].label, time: shiftTime(code) };
});
</script>

<style scoped lang="scss">
.my-schedule {
  max-width: 48rem;
  padding: 16px;
  @media (max-width: 599px) {
    padding: 12px 8px;
  }
}

.my-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 12px;
}
.my-title {
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
.my-next {
  margin: 2px 0 0;
  font-size: 0.9375rem;
  color: var(--text-2);
  strong {
    color: var(--text);
  }
}
.my-stats {
  display: flex;
  gap: 16px;
  margin: 0;
  div {
    text-align: center;
  }
  dt {
    font-size: 0.75rem;
    color: var(--text-2);
  }
  dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
  }
}

.cal-dow,
.cal-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}
.cal-dow {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  padding-bottom: 4px;
}
.cal-week + .cal-week {
  margin-top: 10px;
}
.cal-week-label {
  font-size: 0.75rem;
  color: var(--text-2);
  margin: 0 2px 4px;
}
.cal-days {
  list-style: none;
  margin: 0;
  padding: 0;
}

.day {
  width: 100%;
  min-height: 3.75rem;
  border: 0;
  border-radius: 10px;
  padding: 4px 2px 6px;
  font: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  text-align: center;
  &.swappable {
    cursor: pointer;
    @media (hover: hover) {
      &:hover {
        filter: brightness(0.96);
      }
    }
  }
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  &.today {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
}
.day-date {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 3px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.4;
}
.today .day-num {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--focus);
  color: var(--surface);
}
.hol-mark {
  padding: 0 2px;
  border: 1px solid currentColor;
  border-radius: 3px;
  line-height: 1.1;
}
.day-code {
  font-size: 1.125rem;
  font-weight: 800;
  line-height: 1.1;
}
.day-label {
  font-size: 0.6875rem;
  font-weight: 500;
}

.my-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-top: 14px;
  font-size: 0.8125rem;
  color: var(--text-2);
}
.my-hint {
  margin-left: auto;
  @media (max-width: 599px) {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
