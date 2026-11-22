<template>
  <q-card flat bordered class="violation-panel column no-wrap">
    <q-card-section class="row items-center no-wrap q-py-sm q-px-md">
      <q-icon name="rule" class="q-mr-sm" color="primary" />
      <h2 class="panel-title">規則檢查</h2>
      <q-space />
      <q-btn flat dense round icon="close" aria-label="關閉規則檢查" @click="$emit('close')" />
    </q-card-section>
    <div class="q-px-md q-pb-sm">
      <q-btn-toggle
        v-model="severity"
        spread
        dense
        no-caps
        unelevated
        toggle-color="primary"
        color="soft"
        text-color="ink"
        :options="[
          { value: 'error', slot: 'error' },
          { value: 'warning', slot: 'warning' },
          { value: 'info', slot: 'info' },
        ]"
      >
        <template #error><q-icon name="error" size="16px" class="q-mr-xs" />錯誤 {{ counts.error }}</template>
        <template #warning><q-icon name="warning" size="16px" class="q-mr-xs" />警告 {{ counts.warning }}</template>
        <template #info><q-icon name="info" size="16px" class="q-mr-xs" />提示 {{ counts.info }}</template>
      </q-btn-toggle>
      <div v-if="nurseId || ruleCounts.length" class="row q-gutter-xs q-mt-xs">
        <q-chip
          v-if="nurseId"
          dense
          removable
          color="tint"
          text-color="on-tint"
          icon="person"
          class="q-ml-none"
          remove-aria-label="顯示所有人員"
          @remove="$emit('clear-nurse')"
        >
          {{ nurseName }}
        </q-chip>
        <q-chip
          v-for="r in ruleCounts"
          :key="r.rule"
          dense
          clickable
          :outline="ruleFilter !== r.rule"
          :color="ruleFilter === r.rule ? 'primary' : 'muted'"
          :text-color="ruleFilter === r.rule ? 'white' : undefined"
          :aria-pressed="ruleFilter === r.rule"
          class="q-ml-none"
          @click="ruleFilter = ruleFilter === r.rule ? null : r.rule"
        >
          {{ RULE_LABELS[r.rule] }} {{ r.count }}
        </q-chip>
      </div>
    </div>
    <q-separator />
    <q-list dense separator class="col scroll">
      <q-item v-for="(v, i) in filtered" :key="i" clickable @click="$emit('focus', v)">
        <q-item-section avatar style="min-width: 28px">
          <q-icon :name="ICON[v.severity]" :color="COLOR[v.severity]" size="18px" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="text-body2">{{ v.message }}</q-item-label>
        </q-item-section>
      </q-item>
      <div v-if="!filtered.length" class="empty-state">
        <q-icon name="task_alt" size="32px" color="positive" />
        <div class="empty-title q-mt-xs">沒有{{ SEVERITY_LABEL[severity] }}</div>
        <div v-if="nurseId" class="text-body2 q-mt-xs">{{ nurseName }}目前符合此類規則。</div>
      </div>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RULE_LABELS } from '@/constants/labels';
import type { RuleId, Severity, Violation } from '@/types/schedule';
import type { EvaluationResult } from '@/utils/scheduler';

const props = defineProps<{
  evaluation: EvaluationResult;
  /** Show only this nurse's problems (opened from the grid's rule-check column). */
  nurseId?: string | null;
  nurseName?: string;
}>();
defineEmits<{ close: []; focus: [v: Violation]; 'clear-nurse': [] }>();

const ICON: Record<Severity, string> = { error: 'error', warning: 'warning', info: 'info' };
const COLOR: Record<Severity, string> = { error: 'negative', warning: 'warning', info: 'info' };
const SEVERITY_LABEL: Record<Severity, string> = { error: '錯誤', warning: '警告', info: '提示' };

const scoped = computed(() =>
  props.nurseId ? props.evaluation.violations.filter((v) => v.nurseId === props.nurseId) : props.evaluation.violations,
);
const counts = computed(() => {
  const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const v of scoped.value) c[v.severity]++;
  return c;
});
const nurseName = computed(() => props.nurseName || props.nurseId || '');

function firstSeverity(): Severity {
  return counts.value.error ? 'error' : counts.value.warning ? 'warning' : 'info';
}

const severity = ref<Severity>(firstSeverity());
const ruleFilter = ref<RuleId | null>(null);
watch(severity, () => (ruleFilter.value = null));
watch(
  () => props.nurseId,
  () => {
    severity.value = firstSeverity();
    ruleFilter.value = null;
  },
);

const ofSeverity = computed(() => scoped.value.filter((v) => v.severity === severity.value));
const ruleCounts = computed(() => {
  const map = new Map<RuleId, number>();
  for (const v of ofSeverity.value) map.set(v.rule, (map.get(v.rule) ?? 0) + 1);
  return [...map.entries()].map(([rule, count]) => ({ rule, count }));
});
const filtered = computed(() => ofSeverity.value.filter((v) => !ruleFilter.value || v.rule === ruleFilter.value));
</script>

<style scoped lang="scss">
.violation-panel {
  border-radius: 12px;
  height: 100%;
  max-height: calc(100vh - 220px);
  max-height: calc(100dvh - 220px);
  min-height: 320px;
}
.panel-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: normal;
}
</style>
