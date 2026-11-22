<template>
  <q-dialog :model-value="modelValue" :persistent="running" @update:model-value="close">
    <q-card style="width: 560px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon name="auto_fix_high" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-h6">自動排班</div>
        <q-space />
        <q-chip dense outline color="muted" class="gt-xs">{{ formatPeriod(schedule.startDate, schedule.endDate) }}</q-chip>
      </q-card-section>

      <!-- Options -->
      <q-card-section v-if="!running && !result" class="q-pt-none">
        <q-list dense>
          <q-item tag="label" class="q-px-none">
            <q-item-section avatar><q-toggle v-model="keepLocks" color="primary" /></q-item-section>
            <q-item-section>
              <q-item-label>保留鎖定的格子</q-item-label>
              <q-item-label caption>{{ lockCount }} 格</q-item-label>
            </q-item-section>
          </q-item>
          <q-item tag="label" class="q-px-none">
            <q-item-section avatar><q-toggle v-model="applyLeave" color="primary" /></q-item-section>
            <q-item-section>
              <q-item-label>套用已核准請假</q-item-label>
              <q-item-label caption>{{ leaveRequests.length }} 筆 · 優先序 年休 &gt; 公假 &gt; 預假</q-item-label>
            </q-item-section>
          </q-item>
          <q-item v-if="hasHistory" class="q-px-none">
            <q-item-section avatar><q-icon name="link" color="primary" class="q-ml-sm" /></q-item-section>
            <q-item-section>
              <q-item-label>銜接上一期</q-item-label>
              <q-item-label caption>連續上班 / 班距計入上期最後 7 天</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>

        <div id="gen-quality" class="text-caption text-muted q-mt-md q-mb-xs">運算時間</div>
        <q-btn-toggle
          v-model="quality"
          spread
          no-caps
          unelevated
          toggle-color="primary"
          color="soft"
          text-color="ink"
          aria-labelledby="gen-quality"
          :options="[
            { label: '快速 2 秒', value: 'fast' },
            { label: '標準 6 秒', value: 'normal' },
            { label: '精細 15 秒', value: 'thorough' },
          ]"
        />

        <div class="row q-gutter-xs q-mt-md">
          <q-chip v-for="r in ruleChips" :key="r" dense color="tint" text-color="on-tint" class="q-ml-none">{{ r }}</q-chip>
        </div>
      </q-card-section>

      <!-- Running -->
      <q-card-section v-if="running" class="q-py-lg">
        <q-linear-progress :value="progress" color="primary" size="10px" rounded class="q-mb-sm" aria-label="自動排班進度" />
        <div class="row text-caption text-muted tabular" aria-live="polite">
          <span>{{ Math.round(progress * 100) }}%</span>
          <q-space />
          <span>{{ iterations.toLocaleString() }} 次嘗試</span>
        </div>
      </q-card-section>

      <!-- Result -->
      <q-card-section v-if="result" class="q-pt-none">
        <p class="result-line tabular" aria-live="polite">
          <span v-for="(part, i) in resultParts" :key="part.text" class="result-part" :class="part.cls">
            <span v-if="i" class="sep" aria-hidden="true">·</span>
            <q-icon :name="part.icon" size="18px" />
            {{ part.text }}
          </span>
        </p>

        <q-list v-if="result.evaluation.errorCount" dense bordered class="rounded-borders q-mt-md">
          <q-item v-for="(v, i) in result.evaluation.violations.filter((x) => x.severity === 'error').slice(0, 5)" :key="i">
            <q-item-section avatar style="min-width: 28px"><q-icon name="error" color="negative" size="16px" /></q-item-section>
            <q-item-section class="text-body2">{{ v.message }}</q-item-section>
          </q-item>
        </q-list>

        <q-expansion-item
          v-if="bumped.length"
          dense
          icon="event_busy"
          :label="`未排入的請假 ${bumped.length} 天`"
          header-class="text-on-warn q-px-none"
          class="q-mt-sm"
        >
          <q-list dense>
            <q-item v-for="(b, i) in bumped" :key="i" class="q-px-none">
              <q-item-section avatar style="min-width: 44px"><ShiftPill :code="b.type" dense /></q-item-section>
              <q-item-section>
                <q-item-label>{{ b.nurseName }} · {{ formatMDW(b.date) }}</q-item-label>
                <q-item-label caption>{{ b.reason }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-expansion-item>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-if="running" flat no-caps color="muted" label="停止" @click="cancel" />
        <template v-else>
          <q-btn flat no-caps color="muted" label="取消" @click="close(false)" />
          <q-btn v-if="result" flat no-caps color="primary" icon="refresh" label="重新產生" @click="run" />
          <q-btn v-if="result" unelevated no-caps color="primary" icon="done" label="套用至班表" :loading="applying" @click="apply" />
          <q-btn v-else unelevated no-caps color="primary" icon="play_arrow" label="開始排班" @click="run" />
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import ShiftPill from '@/components/ShiftPill.vue';
import { errorMessage } from '@/services/firebase';
import { solveInWorker, type SolverJob } from '@/services/solverClient';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { snapshotOf, type Snapshot } from '@/composables/useScheduleUndo';
import type { LeaveRequest, RuleConfig, Schedule } from '@/types/schedule';
import { formatMDW, formatPeriod } from '@/utils/dates';
import { historyFrom, plannerNurses, scheduleDays } from '@/utils/scheduleHelpers';
import type { SolveResult } from '@/utils/scheduler';

const props = defineProps<{
  modelValue: boolean;
  schedule: Schedule;
  previous: Schedule | null;
  rules: RuleConfig;
  leaveRequests: LeaveRequest[];
}>();
const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  /** The result was written; `before` lets the page offer undo. */
  applied: [before: Snapshot, after: Snapshot];
}>();

const auth = useAuthStore();
const schedules = useSchedulesStore();

const keepLocks = ref(true);
const applyLeave = ref(true);
const quality = ref<'fast' | 'normal' | 'thorough'>('normal');
const running = ref(false);
const applying = ref(false);
const progress = ref(0);
const iterations = ref(0);
const result = ref<SolveResult | null>(null);
let job: SolverJob | null = null;

const QUALITY = {
  fast: { timeLimitMs: 2000, maxIterations: 700_000 },
  normal: { timeLimitMs: 6000, maxIterations: 2_000_000 },
  thorough: { timeLimitMs: 15000, maxIterations: 6_000_000 },
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      result.value = null;
      progress.value = 0;
    }
  },
);

const lockCount = computed(() => Object.values(props.schedule.locks ?? {}).reduce((n, l) => n + l.length, 0));
const hasHistory = computed(() => Object.keys(historyFrom(props.schedule, props.previous)).length > 0);

const ruleChips = computed(() => {
  const r = props.rules;
  return [
    `平日 D${r.weekdayDemand.D} E${r.weekdayDemand.E} N${r.weekdayDemand.N}`,
    `假日 D${r.weekendDemand.D} E${r.weekendDemand.E} N${r.weekendDemand.N}`,
    `N2+ ≥ ${r.minSeniorPerShift}/班`,
    `連上 ≤ ${r.maxConsecutiveWork}`,
    `連休 ≤ ${r.maxConsecutiveOff}`,
    `例假 ≥ ${r.minOffPerWeek}/週`,
    `休假 ≥ ${r.minOffPerPeriod}/4週`,
    ...(r.minRestHours ? [`班距 ≥ ${r.minRestHours}h`] : []),
  ];
});

const bumped = computed(() => result.value?.leave.placements.filter((p) => p.status !== 'placed') ?? []);

/** Result summary, e.g. 「0 項錯誤 · 3 項警告 · 請假 12/14 排入 · 6.0 秒」. */
const resultParts = computed(() => {
  const r = result.value;
  if (!r) return [];
  const placed = r.leave.placements.filter((p) => p.status === 'placed').length;
  const e = r.evaluation;
  return [
    { text: `${e.errorCount} 項錯誤`, icon: e.errorCount ? 'error' : 'task_alt', cls: e.errorCount ? 'text-negative' : 'text-positive' },
    { text: `${e.warningCount} 項警告`, icon: 'warning', cls: e.warningCount ? 'text-on-warn' : 'text-muted' },
    { text: `請假 ${placed}/${placed + bumped.value.length} 排入`, icon: 'event_available', cls: bumped.value.length ? 'text-on-warn' : 'text-muted' },
    { text: `${(r.elapsedMs / 1000).toFixed(1)} 秒`, icon: 'timer', cls: 'text-muted' },
  ];
});

async function run(): Promise<void> {
  running.value = true;
  progress.value = 0;
  iterations.value = 0;
  result.value = null;
  const s = props.schedule;
  job = solveInWorker(
    {
      days: scheduleDays(s),
      nurses: plannerNurses(s),
      rules: props.rules,
      history: historyFrom(s, props.previous),
      assignments: s.assignments,
      locks: keepLocks.value ? s.locks : {},
      leaveRequests: applyLeave.value ? props.leaveRequests : [],
      ...QUALITY[quality.value],
    },
    (p) => {
      progress.value = p.progress;
      iterations.value = p.iterations;
    },
  );
  try {
    result.value = await job.promise;
  } catch (err) {
    if ((err as Error).message !== '已取消') Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    running.value = false;
    job = null;
  }
}

function cancel(): void {
  job?.cancel();
}

async function apply(): Promise<void> {
  if (!result.value) return;
  applying.value = true;
  const before = snapshotOf(props.schedule);
  try {
    await schedules.applyGenerated(props.schedule, result.value.assignments, result.value.locks, auth.email);
    emit('applied', before, { assignments: result.value.assignments, locks: result.value.locks });
    Notify.create({ type: 'positive', icon: 'check', message: '已套用自動排班結果，可按工具列的復原還原' });
    emit('update:modelValue', false);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    applying.value = false;
  }
}

function close(v: boolean): void {
  if (running.value) return;
  emit('update:modelValue', v);
}
</script>

<style scoped lang="scss">
.result-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 0;
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}
.result-part {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sep {
  margin: 0 8px;
  color: var(--text-3);
}
</style>
