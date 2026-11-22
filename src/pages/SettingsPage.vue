<template>
  <q-page class="page-pad">
    <div class="page-head q-mb-md">
      <h1 class="page-title">系統設定</h1>
      <q-space />
      <span v-if="!dirty" class="text-caption text-muted">所有變更已儲存</span>
      <q-btn flat no-caps color="muted" icon="restart_alt" label="還原預設規則" @click="resetRules" />
      <q-btn unelevated no-caps color="primary" icon="save" label="儲存變更" :loading="saving" :disable="!dirty" @click="save" />
    </div>

    <div class="settings-grid">
      <!-- E-mail -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="outgoing_mail" />通知信</div>
          <q-input v-model="form.portalUrl" outlined dense label="系統網址（Email 連結）" :placeholder="settingsStore.portalUrl" class="q-mb-sm" />
          <q-input v-model="form.emailSenderName" outlined dense label="寄件者名稱" />
        </q-card-section>
      </q-card>

      <!-- Wards & seniority -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="apartment" />病房與人力</div>
          <p class="text-body2 text-muted q-mb-sm">
            每個病房的名稱、每日人力需求、資深人力人數與換班核准方式，由系統管理員或該病房護理長在「病房」頁設定。
          </p>
          <q-btn outline no-caps color="primary" icon="apartment" label="前往病房" :to="{ name: 'wards' }" class="q-mb-md" />
          <div class="section-title"><q-icon name="workspace_premium" />資深人力職級</div>
          <div class="text-caption text-muted q-mb-xs">各病房的資深人力規則以這些職級計算</div>
          <div class="row q-gutter-sm">
            <q-checkbox v-for="lv in NURSE_LEVELS" :key="lv" v-model="form.seniorLevels" :val="lv" :label="lv" dense />
          </div>
        </q-card-section>
      </q-card>

      <!-- Labour rules -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="gavel" />勞基法 / 工時規則</div>
          <div class="row q-col-gutter-sm">
            <q-input v-model.number="form.maxConsecutiveWork" class="col-6" type="number" min="1" outlined dense label="最多連續上班（天）" />
            <q-input v-model.number="form.maxConsecutiveOff" class="col-6" type="number" min="1" outlined dense label="最多連續休假（天）" />
            <q-input v-model.number="form.minOffPerWeek" class="col-6" type="number" min="0" outlined dense label="每週例假（天）" />
            <q-input v-model.number="form.minOffPerPeriod" class="col-6" type="number" min="0" outlined dense label="四週休假（天）" />
            <q-input v-model.number="form.minRestHours" class="col-12" type="number" min="0" outlined dense label="輪班間隔（小時，0 = 不檢查）" />
          </div>
          <div class="section-title q-mt-md"><q-icon name="schedule" />班別時間</div>
          <div v-for="s in WORK_SHIFTS" :key="s" class="row items-center q-col-gutter-sm q-mb-xs">
            <div class="col-auto"><ShiftPill :code="s" /></div>
            <q-input v-model="form.shiftTimes[s].start" class="col" mask="##:##" inputmode="numeric" outlined dense label="開始" :aria-label="`${SHIFT_META[s].label}開始時間`" />
            <q-input v-model="form.shiftTimes[s].end" class="col" mask="##:##" inputmode="numeric" outlined dense label="結束" :aria-label="`${SHIFT_META[s].label}結束時間`" />
          </div>
          <div v-if="forbidden.length" class="row items-center q-gutter-xs q-mt-sm">
            <span class="text-caption text-muted">輪班間隔不足而禁止：</span>
            <q-chip v-for="t in forbidden" :key="t" dense color="error-soft" text-color="negative" icon="block" class="q-ml-none">{{ t }}</q-chip>
          </div>
        </q-card-section>
      </q-card>

      <!-- Holidays -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="celebration" />國定假日</div>
          <div class="row q-gutter-xs q-mb-sm">
            <q-chip
              v-for="h in sortedHolidays"
              :key="h"
              removable
              dense
              color="soft"
              text-color="ink"
              class="q-ml-none"
              :remove-aria-label="`移除 ${formatYMD(h)}`"
              @remove="form.holidays = form.holidays.filter((x) => x !== h)"
            >
              {{ formatYMD(h) }}（{{ weekdayLabel(h) }}）
            </q-chip>
            <span v-if="!form.holidays.length" class="text-caption text-muted">尚未設定國定假日，在下方月曆點選日期即可加入。</span>
          </div>
          <q-date
            v-model="holidayPicker"
            multiple
            mask="YYYY-MM-DD"
            :locale="dateLocale"
            minimal
            flat
            bordered
            class="full-width"
          />
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import ShiftPill from '@/components/ShiftPill.vue';
import { SHIFT_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { NURSE_LEVELS, WORK_SHIFTS, type AppSettings } from '@/types/schedule';
import { formatYMD, weekdayLabel } from '@/utils/dates';
import { dateLocale } from '@/utils/quasarLocale';
import { DEFAULT_RULES, forbiddenTransitions } from '@/utils/scheduler';

const auth = useAuthStore();
const settingsStore = useSettingsStore();
const saving = ref(false);

const clone = (s: AppSettings): AppSettings => JSON.parse(JSON.stringify(s)) as AppSettings;
const form = ref<AppSettings>(clone(settingsStore.settings));
watch(
  () => settingsStore.settings,
  (s) => (form.value = clone(s)),
);

const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(settingsStore.settings));
const sortedHolidays = computed(() => [...form.value.holidays].sort());

const holidayPicker = computed<string[]>({
  get: () => form.value.holidays,
  set: (v) => (form.value.holidays = [...(v ?? [])].sort()),
});

const forbidden = computed(() => {
  try {
    return forbiddenTransitions(form.value).map(([a, b]) => `${a} → ${b}`);
  } catch {
    return [];
  }
});

function resetRules(): void {
  form.value = { ...form.value, ...clone({ ...form.value, ...DEFAULT_RULES }) };
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await settingsStore.save(form.value, auth.email);
    Notify.create({ type: 'positive', icon: 'check', message: '設定已儲存' });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.settings-grid {
  display: grid;
  // min() keeps a single column from overflowing a 320px-wide phone.
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: 16px;
  max-width: 1200px;
}
.section {
  border-radius: 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--text-2);
  margin-bottom: 10px;
}
</style>
