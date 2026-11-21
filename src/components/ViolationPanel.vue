<template>
  <q-card flat bordered class="violation-panel column no-wrap">
    <q-card-section class="row items-center no-wrap q-py-sm q-px-md">
      <q-icon name="rule" class="q-mr-sm" color="primary" />
      <div class="text-subtitle2">規則檢查</div>
      <q-space />
      <q-btn flat dense round size="sm" icon="close" @click="$emit('close')" />
    </q-card-section>
    <div class="q-px-md q-pb-sm">
      <q-btn-toggle
        v-model="severity"
        spread
        dense
        no-caps
        unelevated
        toggle-color="primary"
        color="grey-2"
        text-color="grey-8"
        :options="[
          { value: 'error', slot: 'error' },
          { value: 'warning', slot: 'warning' },
          { value: 'info', slot: 'info' },
        ]"
      >
        <template #error><q-icon name="error" size="16px" class="q-mr-xs" />錯誤 {{ evaluation.errorCount }}</template>
        <template #warning><q-icon name="warning" size="16px" class="q-mr-xs" />警告 {{ evaluation.warningCount }}</template>
        <template #info><q-icon name="info" size="16px" class="q-mr-xs" />提示 {{ evaluation.infoCount }}</template>
      </q-btn-toggle>
      <div v-if="ruleCounts.length" class="row q-gutter-xs q-mt-xs">
        <q-chip
          v-for="r in ruleCounts"
          :key="r.rule"
          dense
          clickable
          :outline="ruleFilter !== r.rule"
          :color="ruleFilter === r.rule ? 'primary' : 'grey-7'"
          :text-color="ruleFilter === r.rule ? 'white' : undefined"
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
      <q-item v-if="!filtered.length">
        <q-item-section class="text-center text-positive q-py-lg">
          <q-icon name="task_alt" size="32px" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RULE_LABELS } from '@/constants/labels';
import type { RuleId, Severity, Violation } from '@/types/schedule';
import type { EvaluationResult } from '@/utils/scheduler';

const props = defineProps<{ evaluation: EvaluationResult }>();
defineEmits<{ close: []; focus: [v: Violation] }>();

const ICON: Record<Severity, string> = { error: 'error', warning: 'warning', info: 'info' };
const COLOR: Record<Severity, string> = { error: 'negative', warning: 'warning', info: 'info' };

const severity = ref<Severity>(props.evaluation.errorCount ? 'error' : props.evaluation.warningCount ? 'warning' : 'info');
const ruleFilter = ref<RuleId | null>(null);
watch(severity, () => (ruleFilter.value = null));

const ofSeverity = computed(() => props.evaluation.violations.filter((v) => v.severity === severity.value));
const ruleCounts = computed(() => {
  const counts = new Map<RuleId, number>();
  for (const v of ofSeverity.value) counts.set(v.rule, (counts.get(v.rule) ?? 0) + 1);
  return [...counts.entries()].map(([rule, count]) => ({ rule, count }));
});
const filtered = computed(() => ofSeverity.value.filter((v) => !ruleFilter.value || v.rule === ruleFilter.value));
</script>

<style scoped lang="scss">
.violation-panel {
  border-radius: 12px;
  height: 100%;
  max-height: calc(100vh - 220px);
  min-height: 320px;
}
</style>
