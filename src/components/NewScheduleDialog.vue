<template>
  <AppDialog
    :model-value="modelValue"
    title="新增排班週期"
    :meta="ward.name"
    description="建立 28 天的班表草稿，並帶入目前的排班人員與國定假日。草稿只有護理長看得到，發布後護理師才會收到。"
    :width="460"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="start" outlined dense label="開始日期" mask="####-##-##" hint="建議從週一開始，四週剛好對齊週次" :rules="[validDate]" lazy-rules>
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

      <dl class="facts tabular">
        <div>
          <dt>期間</dt>
          <dd>{{ start ? formatPeriod(start) : '—' }}<span v-if="start && dayOfWeek(start) !== 1" class="text-on-warn">（不是週一）</span></dd>
        </div>
        <div>
          <dt>排班人員</dt>
          <dd>{{ roster.length }} 位</dd>
        </div>
        <div>
          <dt>國定假日</dt>
          <dd>{{ holidaysInRange.length ? holidaysInRange.map((h) => formatMDW(h)).join('、') : '無' }}</dd>
        </div>
      </dl>

      <q-banner v-if="exists" dense rounded class="bg-error-soft text-negative">{{ ward.name }}此日期的班表已存在，請選擇其他開始日期。</q-banner>
      <q-banner v-else-if="!roster.length" dense rounded class="bg-warn-soft text-on-warn">
        {{ ward.name }}尚無可排班人員。請先在「人員管理」把護理師加入此病房，並開啟「排入班表」。
      </q-banner>
    </div>

    <template #actions>
      <q-btn v-close-popup flat no-caps label="取消" color="muted" />
      <q-btn unelevated no-caps color="primary" label="建立草稿" :loading="busy" :disable="!canCreate" @click="create" />
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import AppDialog from '@/components/AppDialog.vue';
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
.facts {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 0.875rem;
  div {
    display: flex;
    gap: 12px;
    padding: 3px 0;
  }
  dt {
    flex: 0 0 4.5em;
    color: var(--text-2);
  }
  dd {
    margin: 0;
    font-weight: 500;
  }
}
</style>
