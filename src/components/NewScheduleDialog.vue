<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 440px; max-width: 94vw">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="add_circle" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-h6">新增排班週期</div>
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <q-input v-model="start" outlined dense label="開始日期" mask="####-##-##" :rules="[validDate]" lazy-rules>
          <template #prepend><q-icon name="event" /></template>
          <template #append>
            <q-icon name="calendar_month" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-date v-model="start" mask="YYYY-MM-DD" :locale="dateLocale" minimal>
                  <div class="row justify-end"><q-btn v-close-popup flat label="確定" color="primary" /></div>
                </q-date>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>

        <div class="row items-center q-gutter-sm">
          <q-chip icon="date_range" color="grey-2" class="q-ml-none">{{ start ? formatPeriod(start) : '—' }}</q-chip>
          <q-chip v-if="start && dayOfWeek(start) !== 1" icon="info" color="orange-1" text-color="orange-10" dense>
            建議以週一開始
          </q-chip>
        </div>

        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <div class="stat-tile">
              <q-icon name="groups" color="primary" size="20px" />
              <div class="text-h6 tabular">{{ users.schedulable.length }}</div>
              <div class="text-caption text-grey-7">排班人員</div>
            </div>
          </div>
          <div class="col-6">
            <div class="stat-tile">
              <q-icon name="celebration" color="negative" size="20px" />
              <div class="text-h6 tabular">{{ holidaysInRange.length }}</div>
              <div class="text-caption text-grey-7">國定假日</div>
            </div>
          </div>
        </div>
        <div v-if="holidaysInRange.length" class="row q-gutter-xs">
          <q-chip v-for="h in holidaysInRange" :key="h" dense outline color="negative" class="q-ml-none">{{ formatMDW(h) }}</q-chip>
        </div>

        <q-banner v-if="exists" dense rounded class="bg-red-1 text-negative">此日期的班表已存在</q-banner>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="取消" color="grey-8" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="add"
          label="建立"
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
import { dayOfWeek, formatMDW, formatPeriod, periodEnd } from '@/utils/dates';
import { dateLocale } from '@/utils/quasarLocale';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; created: [id: string] }>();

const auth = useAuthStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const users = useUsersStore();

const start = ref(schedules.suggestedStart);
const busy = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) start.value = schedules.suggestedStart;
  },
);

const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) || '日期格式 YYYY-MM-DD';
const exists = computed(() => schedules.list.some((s) => s.id === start.value));
const holidaysInRange = computed(() => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start.value)) return [];
  const end = periodEnd(start.value);
  return settings.settings.holidays.filter((h) => h >= start.value && h <= end).sort();
});
const canCreate = computed(() => validDate(start.value) === true && !exists.value && users.schedulable.length > 0);

async function create(): Promise<void> {
  busy.value = true;
  try {
    const id = await schedules.create(start.value, users.schedulable, settings.settings.holidays, auth.email);
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
.stat-tile {
  border: 1px solid #e3e8ec;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: center;
}
</style>
