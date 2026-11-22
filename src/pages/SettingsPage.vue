<template>
  <q-page class="page page--wide">
    <PageHeader title="系統設定" guide="settings">
      <template #actions>
        <span class="hint save-state" aria-live="polite">{{ dirty ? '有尚未儲存的變更' : '所有變更已儲存' }}</span>
        <q-btn flat no-caps color="muted" label="還原預設規則" @click="resetRules">
          <q-tooltip>把勞基法規則與班別時間改回預設值（尚未儲存）</q-tooltip>
        </q-btn>
        <q-btn unelevated no-caps color="primary" label="儲存變更" :loading="saving" :disable="!dirty" @click="save" />
      </template>
    </PageHeader>

    <div class="settings-grid">
      <!-- Labour rules -->
      <section class="surface section" aria-labelledby="set-rules">
        <h2 id="set-rules" class="section-title">勞基法／工時規則</h2>
        <p class="hint q-mb-md">規則檢查與自動排班依這些數字判斷錯誤，所有病房共用。</p>
        <div class="row q-col-gutter-sm">
          <q-input v-model.number="form.maxConsecutiveWork" class="col-12 col-sm-6" type="number" min="1" inputmode="numeric" outlined dense label="最多連續上班（天）" hint="超過即為錯誤，含上一期最後 7 天" />
          <q-input v-model.number="form.maxConsecutiveOff" class="col-12 col-sm-6" type="number" min="1" inputmode="numeric" outlined dense label="最多連續休假（天）" hint="避免休假集中在同一段" />
          <q-input v-model.number="form.minOffPerWeek" class="col-12 col-sm-6" type="number" min="0" inputmode="numeric" outlined dense label="每週例假（天）" hint="每 7 天至少休息幾天" />
          <q-input v-model.number="form.minOffPerPeriod" class="col-12 col-sm-6" type="number" min="0" inputmode="numeric" outlined dense label="四週休假（天）" hint="28 天內例假加休息日的下限" />
          <q-input v-model.number="form.minRestHours" class="col-12" type="number" min="0" inputmode="numeric" outlined dense label="輪班間隔（小時）" hint="兩班之間至少休息幾小時，勞基法為 11；0 表示不檢查" />
        </div>
      </section>

      <!-- Shift times -->
      <section class="surface section" aria-labelledby="set-times">
        <h2 id="set-times" class="section-title">班別時間</h2>
        <p class="hint q-mb-md">用來計算輪班間隔，也會寫入護理師的行事曆活動。結束早於開始代表跨過午夜。</p>
        <div v-for="s in WORK_SHIFTS" :key="s" class="row items-center q-col-gutter-sm q-mb-xs">
          <div class="col-auto"><ShiftPill :code="s" /></div>
          <q-input v-model="form.shiftTimes[s].start" class="col" mask="##:##" inputmode="numeric" outlined dense label="開始" :aria-label="`${SHIFT_META[s].label}開始時間`" />
          <q-input v-model="form.shiftTimes[s].end" class="col" mask="##:##" inputmode="numeric" outlined dense label="結束" :aria-label="`${SHIFT_META[s].label}結束時間`" />
        </div>
        <div v-if="forbidden.length" class="q-mt-sm">
          <p class="hint">依目前的時間與輪班間隔，這些接班會被標示為錯誤：</p>
          <div class="row q-gutter-xs q-mt-xs">
            <q-chip v-for="t in forbidden" :key="t" dense color="error-soft" text-color="negative" icon="block" class="q-ml-none">{{ t }}</q-chip>
          </div>
        </div>
      </section>

      <!-- Seniority -->
      <section class="surface section" aria-labelledby="set-senior">
        <h2 id="set-senior" class="section-title">資深人力職級</h2>
        <p class="hint q-mb-sm">勾選的職級計入每班的「N2+ 資深人力」。各病房每班需要幾位，在「病房 › 人力設定」設定。</p>
        <div class="row q-gutter-sm">
          <q-checkbox v-for="lv in NURSE_LEVELS" :key="lv" v-model="form.seniorLevels" :val="lv" :label="lv" />
        </div>
        <q-btn unelevated no-caps color="soft" text-color="ink" label="前往病房" :to="{ name: 'wards' }" class="q-mt-md" />
      </section>

      <!-- E-mail -->
      <section class="surface section" aria-labelledby="set-mail">
        <h2 id="set-mail" class="section-title">通知信</h2>
        <p class="hint q-mb-md">發布班表與換班時寄出的 Email。</p>
        <q-input v-model="form.portalUrl" outlined dense label="系統網址" :placeholder="settingsStore.portalUrl" hint="Email 中「查看班表」等連結的網址；留空則使用目前網址" class="q-mb-md" />
        <q-input v-model="form.emailSenderName" outlined dense label="寄件者名稱" hint="收件人在信箱中看到的名稱" />
      </section>

      <!-- Holidays -->
      <section class="surface section section--wide" aria-labelledby="set-holidays">
        <h2 id="set-holidays" class="section-title">國定假日</h2>
        <p class="hint q-mb-sm">這些日期改用週末人力需求，並在班表上標示「假」。在月曆點選日期即可加入或移除。新增週期時會帶入；既有班表可在班表頁點選日期標題調整。</p>
        <div class="holiday-layout">
          <q-date v-model="holidayPicker" multiple mask="YYYY-MM-DD" :locale="dateLocale" minimal flat bordered class="holiday-date" />
          <div class="holiday-list">
            <div class="text-caption text-muted q-mb-xs">已設定 {{ form.holidays.length }} 天</div>
            <div class="row q-gutter-xs">
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
            </div>
          </div>
        </div>
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import PageHeader from '@/components/PageHeader.vue';
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
.save-state {
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}
.settings-grid {
  display: grid;
  // min() keeps a single column from overflowing a 320px-wide phone.
  grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
  gap: 16px;
}
.section {
  padding: 16px;
  &--wide {
    grid-column: 1 / -1;
  }
}
.holiday-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.holiday-date {
  flex: 0 0 auto;
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}
.holiday-list {
  flex: 1 1 16rem;
  min-width: 0;
}
</style>
