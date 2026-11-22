<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 440px; max-width: 94vw">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="add_circle" color="primary" size="24px" class="q-mr-sm" />
        <div class="col" style="min-width: 0">
          <div class="text-h6">新增排班週期</div>
          <div class="text-caption text-muted ellipsis">{{ ward.name }}</div>
        </div>
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <q-input v-model="start" outlined dense label="開始日期" mask="####-##-##" :rules="[validDate]" lazy-rules>
          <template #prepend><q-icon name="event" /></template>
          <template #append>
            <q-btn flat round dense icon="calendar_month" aria-label="從月曆選擇開始日期">
              <q-popup-proxy cover>
                <q-date v-model="start" mask="YYYY-MM-DD" :locale="dateLocale" minimal>
                  <div class="row justify-end"><q-btn v-close-popup flat no-caps label="完成" color="primary" /></div>
                </q-date>
              </q-popup-proxy>
            </q-btn>
          </template>
        </q-input>

        <div class="row items-center q-gutter-sm">
          <q-chip icon="date_range" color="soft" text-color="ink" class="q-ml-none">{{ start ? formatPeriod(start) : '—' }}</q-chip>
          <q-chip v-if="start && dayOfWeek(start) !== 1" icon="info" color="warn-soft" text-color="on-warn" dense>
            建議以週一開始
          </q-chip>
        </div>

        <p class="summary tabular">
          {{ roster.length }} 位排班人員 · {{ holidaysInRange.length }} 個國定假日
        </p>
        <div v-if="holidaysInRange.length" class="row q-gutter-xs">
          <q-chip v-for="h in holidaysInRange" :key="h" dense color="soft" text-color="ink" icon="celebration" class="q-ml-none">{{ formatMDW(h) }}</q-chip>
        </div>

        <q-banner v-if="exists" dense rounded class="bg-error-soft text-negative">{{ ward.name }}此日期的班表已存在，請選擇其他開始日期</q-banner>
        <q-banner v-else-if="!roster.length" dense rounded class="bg-warn-soft text-on-warn">
          {{ ward.name }}尚無可排班人員，請先在「人員管理」把護理師加入此病房並勾選「排入班表」
        </q-banner>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="取消" color="muted" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="add"
          label="建立草稿"
          :loading="busy"
          :disable="!canCreate"
          @click="create"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useUsersStore } from '@/stores/users';
import type { Ward } from '@/types/schedule';
import { dayOfWeek, formatMDW, formatPeriod, periodEnd } from '@/utils/dates';
import { dateLocale } from '@/utils/quasarLocale';
import { scheduleIdOf } from '@/utils/wards';

const props = defineProps<{ modelValue: boolean; ward: Ward }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; created: [id: string] }>();

const auth = useAuthStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const users = useUsersStore();

const start = ref(schedules.suggestedStartFor(props.ward.id));
const busy = ref(false);
const roster = computed(() => users.rosterOf(props.ward.id));

watch(
  () => props.modelValue,
  (open) => {
    if (open) start.value = schedules.suggestedStartFor(props.ward.id);
  },
);

const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) || '請以 YYYY-MM-DD 輸入日期，例如 2026-12-07';
const exists = computed(() => schedules.list.some((s) => s.id === scheduleIdOf(props.ward.id, start.value)));
const holidaysInRange = computed(() => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start.value)) return [];
  const end = periodEnd(start.value);
  return settings.settings.holidays.filter((h) => h >= start.value && h <= end).sort();
});
const canCreate = computed(() => validDate(start.value) === true && !exists.value && roster.value.length > 0);

async function create(): Promise<void> {
  busy.value = true;
  try {
    const id = await schedules.create(props.ward.id, start.value, roster.value, settings.settings.holidays, auth.email);
    Notify.create({ type: 'positive', message: '已建立班表草稿', icon: 'check' });
    emit('created', id);
    emit('update:modelValue', false);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.summary {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 500;
}
</style>
