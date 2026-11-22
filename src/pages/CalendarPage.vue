<template>
  <q-page class="page-pad">
    <div class="page-head q-mb-md">
      <h1 class="page-title q-my-none">加入行事曆</h1>
      <q-space />
      <q-btn flat no-caps color="primary" icon="arrow_back" label="回班表" :to="{ name: 'schedule' }" />
    </div>

    <div v-if="loading" class="surface empty-state cal-box" role="status">
      <q-spinner size="32px" color="primary" />
      <div class="q-mt-sm">載入班表中…</div>
    </div>

    <div v-else-if="problem" class="surface empty-state cal-box">
      <q-icon name="event_busy" size="48px" class="text-subtle" />
      <div class="empty-title q-mt-sm">{{ problem }}</div>
      <q-btn unelevated no-caps color="primary" label="回班表" class="q-mt-md" :to="{ name: 'schedule' }" />
    </div>

    <section v-else-if="schedule" class="surface cal-box" aria-labelledby="cal-title">
      <h2 id="cal-title" class="cal-title">{{ wardName }} · {{ period }}</h2>
      <p class="cal-sub">
        將 <strong>{{ workCount }}</strong> 個上班日<template v-if="leaveCount">、<strong>{{ leaveCount }}</strong> 個請假日</template>加入你的行事曆（休假日不加入）。
      </p>

      <div class="cal-actions">
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="event_available"
          :label="result ? '重新同步 Google 日曆' : '加入 Google 日曆'"
          :loading="syncing"
          :disable="!ready || !events.length || useEmulators"
          @click="syncGoogle"
        >
          <template #loading>
            <q-spinner size="1em" class="q-mr-sm" />
            同步中 {{ progress.done }}/{{ progress.total || '…' }}
          </template>
        </q-btn>
        <q-btn
          outline
          no-caps
          color="primary"
          icon="download"
          label="下載 .ics（Apple、Outlook）"
          :disable="!ready || !events.length"
          @click="downloadIcs"
        />
      </div>

      <div aria-live="polite">
        <q-banner v-if="result" dense rounded class="bg-ok-soft q-mt-md">
          <template #avatar><q-icon name="check_circle" color="positive" /></template>
          已同步到 Google 日曆：{{ resultText }}。
          <template #action>
            <q-btn flat no-caps color="primary" label="開啟 Google 日曆" icon-right="open_in_new" :href="googleUrl" target="_blank" rel="noopener" />
          </template>
        </q-banner>
        <q-banner v-if="error" dense rounded class="bg-error-soft q-mt-md">
          <template #avatar><q-icon name="error" color="negative" /></template>
          {{ error }}
        </q-banner>
      </div>

      <p v-if="useEmulators" class="cal-note">模擬器環境無法連線 Google 日曆，請改用 .ics 檔測試。</p>
      <p class="cal-note">
        第一次使用時，Google 會詢問是否允許本系統管理你的日曆活動。系統只會新增、更新或移除這份班表的班別，不會讀取或更動其他行程。
        班表異動（例如換班核准）後再按一次即可更新，不會重複新增。
      </p>

      <ol class="cal-list" aria-label="將加入的班別">
        <li v-for="e in events" :key="e.id">
          <span class="cal-date tabular">{{ formatMDW(e.date) }}</span>
          <ShiftPill :code="e.code" dense :tooltip="false" />
          <span class="cal-label">{{ SHIFT_META[e.code].label }}</span>
          <span class="cal-time tabular">{{ e.allDay ? '整天' : timeOf(e.code) }}</span>
        </li>
      </ol>
      <p v-if="!events.length" class="cal-note">這份班表中你沒有上班或請假日。</p>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { doc, getDoc } from 'firebase/firestore';
import ShiftPill from '@/components/ShiftPill.vue';
import { SHIFT_META } from '@/constants/labels';
import { buildIcs, buildShiftEvents, googleCalendarWeekUrl } from '@/services/calendarExport';
import { portalLink } from '@/services/emailTemplates';
import { db, errorMessage, useEmulators } from '@/services/firebase';
import { CalendarError, requestCalendarAccess, syncScheduleToGoogle, type SyncResult } from '@/services/googleCalendar';
import { useAuthStore } from '@/stores/auth';
import { normalizeSchedule, useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useWardsStore } from '@/stores/wards';
import { isWorkShift, type Schedule, type ShiftCode } from '@/types/schedule';
import { formatMDW, formatPeriod } from '@/utils/dates';

const route = useRoute();
const auth = useAuthStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const wards = useWardsStore();

const schedule = shallowRef<Schedule | null>(null);
const loading = ref(true);
const loadError = ref('');
const syncing = ref(false);
const progress = reactive({ done: 0, total: 0 });
const result = ref<SyncResult | null>(null);
const error = ref('');

/** `?schedule=<id>` from the e-mail; in-app links may omit it to use the selected period. */
const scheduleId = computed(() => {
  const q = route.query.schedule;
  return typeof q === 'string' && q ? q : (schedules.current?.id ?? '');
});

watch(
  scheduleId,
  async (id) => {
    result.value = null;
    error.value = '';
    loadError.value = '';
    schedule.value = null;
    if (!id) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const snap = await getDoc(doc(db(), 'schedules', id));
      if (id !== scheduleId.value) return;
      schedule.value = snap.exists() ? normalizeSchedule(snap.id, snap.data()) : null;
    } catch (err) {
      // Staff nurses may not read drafts, which Firestore reports as permission-denied.
      loadError.value = (err as { code?: string }).code === 'permission-denied' ? '找不到這份班表，或班表尚未發布' : errorMessage(err);
    } finally {
      if (id === scheduleId.value) loading.value = false;
    }
  },
  { immediate: true },
);

const problem = computed(() => {
  if (loadError.value) return loadError.value;
  if (!scheduleId.value) return '請從班表 Email 或班表頁開啟此頁';
  const s = schedule.value;
  if (!s) return '找不到這份班表，或班表尚未發布';
  if (s.status !== 'published') return '班表尚未發布，發布後才能加入行事曆';
  if (!s.assignments[auth.email]) return '你不在這份班表中';
  return '';
});

/** Shift times and the ward name end up in the events: wait for both so defaults never leak in. */
const ready = computed(() => settings.loaded && wards.loaded);
const shiftTimes = computed(() => wards.rulesFor(schedule.value?.wardId).shiftTimes);
const wardName = computed(() => wards.nameOf(schedule.value?.wardId));
const period = computed(() => (schedule.value ? formatPeriod(schedule.value.startDate, schedule.value.endDate) : ''));
const scheduleUrl = computed(() => portalLink(settings.portalUrl, '/schedule'));

const events = computed(() =>
  schedule.value
    ? buildShiftEvents({
        schedule: schedule.value,
        nurseId: auth.email,
        shiftTimes: shiftTimes.value,
        wardName: wardName.value,
        portalUrl: scheduleUrl.value,
      })
    : [],
);
const workCount = computed(() => events.value.filter((e) => !e.allDay).length);
const leaveCount = computed(() => events.value.filter((e) => e.allDay).length);
const googleUrl = computed(() => googleCalendarWeekUrl(events.value[0]?.date ?? schedule.value?.startDate ?? ''));

const resultText = computed(() => {
  const r = result.value;
  if (!r) return '';
  const parts = [r.added && `新增 ${r.added} 筆`, r.updated && `更新 ${r.updated} 筆`, r.removed && `移除 ${r.removed} 筆`].filter(Boolean);
  return parts.length ? parts.join('、') : '沒有變更';
});

function timeOf(code: ShiftCode): string {
  if (!isWorkShift(code)) return '';
  const t = shiftTimes.value[code];
  return `${t.start}–${t.end}`;
}

async function syncGoogle(): Promise<void> {
  const s = schedule.value;
  if (!s) return;
  error.value = '';
  result.value = null;
  progress.done = 0;
  progress.total = 0;
  syncing.value = true;
  try {
    // Must start inside the click handler so the browser allows Google's popup.
    const token = await requestCalendarAccess();
    result.value = await syncScheduleToGoogle(token, s.id, events.value, {
      portalUrl: scheduleUrl.value,
      onProgress: (done, total) => Object.assign(progress, { done, total }),
    });
  } catch (err) {
    if (!(err instanceof CalendarError && err.kind === 'cancelled')) error.value = errorMessage(err);
  } finally {
    syncing.value = false;
  }
}

function downloadIcs(): void {
  const s = schedule.value;
  if (!s) return;
  const ics = buildIcs(events.value, { calendarName: `${wardName.value}班表 ${period.value}` });
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `班表_${s.startDate}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
</script>

<style scoped lang="scss">
.cal-box {
  max-width: 46rem;
  padding: 16px;
  @media (max-width: 599px) {
    padding: 12px;
  }
}
.cal-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
.cal-sub {
  margin: 4px 0 0;
  color: var(--text-2);
  strong {
    color: var(--text);
  }
}
.cal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  @media (max-width: 599px) {
    .q-btn {
      flex: 1 1 100%;
    }
  }
}
.cal-note {
  margin: 12px 0 0;
  font-size: 0.8125rem;
  color: var(--text-2);
}
.cal-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
  li {
    display: grid;
    grid-template-columns: 7.5em auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 8px 2px;
    border-bottom: 1px solid var(--line);
    font-size: 0.875rem;
  }
}
.cal-date {
  color: var(--text-2);
}
.cal-time {
  color: var(--text-2);
}
</style>
