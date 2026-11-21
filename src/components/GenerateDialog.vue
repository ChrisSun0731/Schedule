<template>
  <q-dialog :model-value="modelValue" :persistent="running" @update:model-value="close">
    <q-card style="width: 560px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-sm">
        <q-icon name="auto_fix_high" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-h6">自動排班</div>
        <q-space />
        <q-chip dense outline color="grey-8">{{ formatPeriod(schedule.startDate, schedule.endDate) }}</q-chip>
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

        <div class="text-caption text-grey-7 q-mt-md q-mb-xs">運算時間</div>
        <q-btn-toggle
          v-model="quality"
          spread
          no-caps
          unelevated
          toggle-color="primary"
          color="grey-2"
          text-color="grey-9"
          :options="[
            { label: '快速 2 秒', value: 'fast' },
            { label: '標準 6 秒', value: 'normal' },
            { label: '精細 15 秒', value: 'thorough' },
          ]"
        />

        <div class="row q-gutter-xs q-mt-md">
          <q-chip v-for="r in ruleChips" :key="r" dense color="teal-1" text-color="teal-10" class="q-ml-none">{{ r }}</q-chip>
        </div>
      </q-card-section>

      <!-- Running -->
      <q-card-section v-if="running" class="q-py-lg">
        <q-linear-progress :value="progress" color="primary" size="10px" rounded class="q-mb-sm" />
        <div class="row text-caption text-grey-7 tabular">
          <span>{{ Math.round(progress * 100) }}%</span>
          <q-space />
          <span>{{ iterations.toLocaleString() }} 次嘗試</span>
        </div>
      </q-card-section>

      <!-- Result -->
      <q-card-section v-if="result" class="q-pt-none">
        <div class="row q-col-gutter-sm">
          <div v-for="tile in resultTiles" :key="tile.label" class="col-3">
            <div class="result-tile" :class="tile.cls">
              <q-icon :name="tile.icon" size="18px" />
              <div class="text-h6 tabular">{{ tile.value }}</div>
              <div class="text-caption">{{ tile.label }}</div>
            </div>
          </div>
        </div>

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
          header-class="text-orange-10 q-px-none"
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
        <q-btn v-if="running" flat no-caps color="grey-8" label="停止" @click="cancel" />
        <template v-else>
          <q-btn flat no-caps color="grey-8" label="取消" @click="close(false)" />
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
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>();

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

const resultTiles = computed(() => {
  const r = result.value;
  if (!r) return [];
  const placed = r.leave.placements.filter((p) => p.status === 'placed').length;
  return [
    { label: '錯誤', value: r.evaluation.errorCount, icon: 'error', cls: r.evaluation.errorCount ? 'tile-bad' : 'tile-good' },
    { label: '警告', value: r.evaluation.warningCount, icon: 'warning', cls: r.evaluation.warningCount ? 'tile-warn' : 'tile-good' },
    { label: '請假排入', value: `${placed}/${placed + bumped.value.length}`, icon: 'event_available', cls: bumped.value.length ? 'tile-warn' : 'tile-good' },
    { label: '秒', value: (r.elapsedMs / 1000).toFixed(1), icon: 'timer', cls: '' },
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
  try {
    await schedules.applyGenerated(props.schedule, result.value.assignments, result.value.locks, auth.email);
    Notify.create({ type: 'positive', icon: 'check', message: '已套用自動排班結果' });
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
.result-tile {
  border-radius: 10px;
  padding: 8px;
  text-align: center;
  background: #f4f6f8;
  color: #52606d;
}
.tile-good {
  background: #e6f6ec;
  color: #1f7a45;
}
.tile-warn {
  background: #fff4db;
  color: #9a6700;
}
.tile-bad {
  background: #ffe3e3;
  color: #c92a2a;
}
</style>
