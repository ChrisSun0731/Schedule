<template>
  <q-page class="page-pad">
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-icon name="tune" size="26px" color="primary" />
      <div class="page-title">系統設定</div>
      <q-space />
      <q-btn flat no-caps color="grey-8" icon="restart_alt" label="還原預設規則" @click="resetRules" />
      <q-btn unelevated no-caps color="primary" icon="save" label="儲存" :loading="saving" :disable="!dirty" @click="save" />
    </div>

    <div class="settings-grid">
      <!-- Ward -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="apartment" />病房</div>
          <q-input v-model="form.wardName" outlined dense label="病房名稱" class="q-mb-sm" />
          <q-input v-model="form.portalUrl" outlined dense label="系統網址（Email 連結）" :placeholder="settingsStore.portalUrl" class="q-mb-sm" />
          <q-input v-model="form.emailSenderName" outlined dense label="寄件者名稱" />
          <q-toggle v-model="form.requireHeadApproval" class="q-mt-sm" color="primary" label="換班一律需護理長核准" />
        </q-card-section>
      </q-card>

      <!-- Demand -->
      <q-card flat bordered class="section">
        <q-card-section>
          <div class="section-title"><q-icon name="groups" />每日人力需求</div>
          <table class="demand-table">
            <thead>
              <tr>
                <th></th>
                <th v-for="s in WORK_SHIFTS" :key="s"><ShiftPill :code="s" dense /></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>平日（一至五）</td>
                <td v-for="s in WORK_SHIFTS" :key="s"><q-input v-model.number="form.weekdayDemand[s]" type="number" min="0" dense outlined /></td>
              </tr>
              <tr>
                <td>週末 / 國定假日</td>
                <td v-for="s in WORK_SHIFTS" :key="s"><q-input v-model.number="form.weekendDemand[s]" type="number" min="0" dense outlined /></td>
              </tr>
            </tbody>
          </table>
          <div class="section-title q-mt-md"><q-icon name="workspace_premium" />資深人力（每班）</div>
          <div class="row q-col-gutter-sm">
            <q-input v-model.number="form.minSeniorPerShift" class="col-6" type="number" min="0" outlined dense label="最少" />
            <q-input v-model.number="form.preferredSeniorPerShift" class="col-6" type="number" min="0" outlined dense label="建議" />
          </div>
          <div class="row q-gutter-sm q-mt-xs">
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
            <q-input v-model="form.shiftTimes[s].start" class="col" mask="##:##" outlined dense label="開始" />
            <q-input v-model="form.shiftTimes[s].end" class="col" mask="##:##" outlined dense label="結束" />
          </div>
          <div class="row q-gutter-xs q-mt-sm">
            <q-chip v-for="t in forbidden" :key="t" dense color="red-1" text-color="negative" icon="block" class="q-ml-none">{{ t }}</q-chip>
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
              color="red-1"
              text-color="negative"
              class="q-ml-none"
              @remove="form.holidays = form.holidays.filter((x) => x !== h)"
            >
              {{ formatYMD(h) }}（{{ weekdayLabel(h) }}）
            </q-chip>
            <span v-if="!form.holidays.length" class="text-caption text-grey-6">—</span>
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
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  max-width: 1200px;
}
.section {
  border-radius: 12px;
  background: #fff;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #3e4c59;
  margin-bottom: 10px;
}
.demand-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 4px;
  td:first-child {
    font-size: 13px;
    color: #52606d;
    white-space: nowrap;
  }
  th {
    text-align: center;
  }
}
</style>
