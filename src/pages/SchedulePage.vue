<template>
  <q-page class="page-pad">
    <!-- Toolbar -->
    <div class="row items-center q-col-gutter-sm q-mb-sm">
      <div class="col-12 col-md-auto row items-center no-wrap q-gutter-x-sm">
        <q-select
          :model-value="schedules.selectedId"
          dense
          outlined
          emit-value
          map-options
          options-dense
          :options="periodOptions"
          class="period-select bg-white"
          :disable="!schedules.list.length"
          @update:model-value="schedules.select"
        >
          <template #prepend><q-icon name="calendar_month" color="primary" /></template>
          <template #option="{ itemProps, opt }">
            <q-item v-bind="itemProps">
              <q-item-section>{{ opt.label }}</q-item-section>
              <q-item-section side>
                <q-badge :color="opt.published ? 'positive' : 'grey-5'">{{ opt.published ? '已發布' : '草稿' }}</q-badge>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-chip
          v-if="current"
          :color="published ? 'positive' : 'grey-6'"
          text-color="white"
          :icon="published ? 'verified' : 'edit_note'"
          class="q-ma-none"
        >
          {{ published ? '已發布' : '草稿' }}
        </q-chip>
      </div>

      <div class="col-12 col-md row items-center justify-end q-gutter-sm">
        <template v-if="current && evaluation">
          <q-btn
            dense
            unelevated
            no-caps
            :color="evaluation.errorCount ? 'red-1' : 'green-1'"
            :text-color="evaluation.errorCount ? 'negative' : 'positive'"
            :icon="evaluation.errorCount ? 'error' : 'task_alt'"
            :label="String(evaluation.errorCount)"
            class="issue-btn"
            @click="panelOpen = !panelOpen"
          >
            <q-tooltip>規則錯誤</q-tooltip>
          </q-btn>
          <q-btn
            dense
            unelevated
            no-caps
            color="orange-1"
            text-color="orange-10"
            icon="warning"
            :label="String(evaluation.warningCount)"
            class="issue-btn"
            @click="panelOpen = !panelOpen"
          >
            <q-tooltip>警告</q-tooltip>
          </q-btn>
        </template>

        <q-btn v-if="auth.isManager" outline no-caps color="primary" icon="add" :label="$q.screen.gt.xs ? '新增週期' : ''" @click="dialogs.create = true">
          <q-tooltip v-if="!$q.screen.gt.xs">新增週期</q-tooltip>
        </q-btn>
        <q-btn
          v-if="auth.isManager && current"
          outline
          no-caps
          color="primary"
          icon="auto_fix_high"
          :label="$q.screen.gt.xs ? '自動排班' : ''"
          @click="dialogs.generate = true"
        >
          <q-tooltip v-if="!$q.screen.gt.xs">自動排班</q-tooltip>
        </q-btn>
        <q-btn v-if="auth.isManager && current" outline no-caps color="primary" icon="table_view" :label="$q.screen.gt.xs ? '匯出 Excel' : ''" @click="exportExcel">
          <q-tooltip v-if="!$q.screen.gt.xs">匯出 Excel</q-tooltip>
        </q-btn>
        <q-btn
          v-if="current && published && canRequestSwap"
          outline
          no-caps
          color="primary"
          icon="swap_horiz"
          :label="$q.screen.gt.xs ? '申請換班' : ''"
          @click="openSwap(null)"
        >
          <q-tooltip v-if="!$q.screen.gt.xs">申請換班</q-tooltip>
        </q-btn>
        <q-btn
          v-if="auth.isManager && current"
          unelevated
          no-caps
          color="primary"
          :icon="published ? 'forward_to_inbox' : 'campaign'"
          :label="published ? '重新通知' : '發布並通知'"
          @click="dialogs.publish = true"
        />
        <q-btn v-if="auth.isManager && current" flat round dense icon="more_vert">
          <q-menu anchor="bottom right" self="top right">
            <q-list dense style="min-width: 200px">
              <q-item v-close-popup clickable @click="syncRoster">
                <q-item-section avatar><q-icon name="group_add" /></q-item-section>
                <q-item-section>同步人員名單</q-item-section>
              </q-item>
              <q-item v-close-popup clickable :disable="!lockCount" @click="clearLocks">
                <q-item-section avatar><q-icon name="lock_open" /></q-item-section>
                <q-item-section>清除全部鎖定</q-item-section>
                <q-item-section side>{{ lockCount }}</q-item-section>
              </q-item>
              <q-item v-if="published" v-close-popup clickable @click="unpublish">
                <q-item-section avatar><q-icon name="unpublished" /></q-item-section>
                <q-item-section>改回草稿</q-item-section>
              </q-item>
              <q-separator />
              <q-item v-close-popup clickable class="text-negative" :disable="published && !auth.isDeveloper" @click="removeSchedule">
                <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                <q-item-section>刪除班表</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <!-- Filters + legend -->
    <div v-if="current" class="row items-center q-col-gutter-sm q-mb-sm">
      <div class="col-12 col-sm-auto">
        <q-input v-model="search" dense outlined clearable placeholder="搜尋姓名 / 編號" class="bg-white search">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-auto row items-center q-gutter-xs">
        <q-btn
          v-for="lv in NURSE_LEVELS"
          :key="lv"
          dense
          unelevated
          no-caps
          size="sm"
          :color="levelFilter.includes(lv) ? 'primary' : 'grey-3'"
          :text-color="levelFilter.includes(lv) ? 'white' : 'grey-8'"
          :label="lv"
          @click="toggleLevel(lv)"
        />
        <q-toggle v-model="showIssues" dense size="sm" color="negative" icon="rule" class="q-ml-sm">
          <q-tooltip>標示違規</q-tooltip>
        </q-toggle>
      </div>
      <div class="col-12 col-md row items-center justify-end q-gutter-x-sm legend">
        <span v-for="c in SHIFT_CODES" :key="c" class="row items-center no-wrap">
          <ShiftPill :code="c" dense :tooltip="false" />
          <span class="q-ml-xs text-caption text-grey-8">{{ SHIFT_META[c].label }}</span>
        </span>
        <span v-if="auth.isManager" class="text-caption text-grey-6 gt-sm">
          <span class="lock-glyph" /> 鎖定 · 鍵盤 D/E/N/O/A/L/R
        </span>
      </div>
    </div>

    <!-- Content -->
    <div v-if="!schedules.loaded" class="q-pa-xl flex flex-center">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <div v-else-if="!current" class="empty surface q-pa-xl text-center">
      <q-icon name="event_note" size="56px" color="grey-5" />
      <div class="text-subtitle1 q-mt-sm text-grey-8">{{ auth.isManager ? '尚無班表' : '尚無已發布的班表' }}</div>
      <q-btn v-if="auth.isManager" unelevated no-caps color="primary" icon="add" label="建立排班週期" class="q-mt-md" @click="dialogs.create = true" />
    </div>

    <div v-else-if="evaluation" class="row no-wrap q-col-gutter-md">
      <div class="col" style="min-width: 0">
        <ScheduleGrid
          :schedule="current"
          :days="days"
          :rows="rows"
          :evaluation="evaluation"
          :editable="auth.isManager"
          :me-id="auth.email"
          :show-issues="showIssues"
          :focus="focus"
          @set-cell="setCell"
          @set-lock="setLock"
          @toggle-holiday="toggleHoliday"
          @remove-row="removeRow"
          @swap="openSwap"
        />
        <div class="text-caption text-grey-6 q-mt-xs row q-gutter-x-md">
          <span>更新 {{ formatDateTime(current.updatedAt) }} · {{ current.updatedBy }}</span>
          <span v-if="current.publishedAt">發布 {{ formatDateTime(current.publishedAt) }}</span>
        </div>
      </div>
      <div v-if="panelOpen && $q.screen.gt.sm" class="col-auto" style="width: 320px">
        <ViolationPanel :evaluation="evaluation" @close="panelOpen = false" @focus="focusOn" />
      </div>
    </div>

    <q-dialog v-if="evaluation" :model-value="panelOpen && !$q.screen.gt.sm" position="bottom" @update:model-value="panelOpen = $event">
      <div style="width: 100%; height: 70vh">
        <ViolationPanel :evaluation="evaluation" @close="panelOpen = false" @focus="focusOn" />
      </div>
    </q-dialog>

    <!-- Dialogs -->
    <NewScheduleDialog v-model="dialogs.create" />
    <GenerateDialog
      v-if="current"
      v-model="dialogs.generate"
      :schedule="current"
      :previous="previous"
      :rules="settings.rules"
      :leave-requests="approvedLeave"
    />
    <PublishDialog v-if="current && evaluation" v-model="dialogs.publish" :schedule="current" :evaluation="evaluation" />
    <SwapRequestDialog v-if="current && published" v-model="dialogs.swap" :schedule="current" :initial-day="swapDay" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog, Notify, useQuasar } from 'quasar';
import GenerateDialog from '@/components/GenerateDialog.vue';
import NewScheduleDialog from '@/components/NewScheduleDialog.vue';
import PublishDialog from '@/components/PublishDialog.vue';
import ScheduleGrid from '@/components/ScheduleGrid.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import SwapRequestDialog from '@/components/SwapRequestDialog.vue';
import ViolationPanel from '@/components/ViolationPanel.vue';
import { SHIFT_META } from '@/constants/labels';
import { exportScheduleXlsx } from '@/services/excelExport';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useUsersStore } from '@/stores/users';
import { NURSE_LEVELS, SHIFT_CODES, type NurseLevel, type NurseSnapshot, type ShiftCode, type Violation } from '@/types/schedule';
import { formatDateTime, formatPeriod } from '@/utils/dates';
import { evaluateScheduleDoc, scheduleDays } from '@/utils/scheduleHelpers';

const $q = useQuasar();
const auth = useAuthStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const leaves = useLeavesStore();
const users = useUsersStore();

const dialogs = reactive({ create: false, generate: false, publish: false, swap: false });
const panelOpen = ref(false);
const showIssues = ref(auth.isManager);
const search = ref<string | null>('');
const levelFilter = ref<NurseLevel[]>([]);
const focus = ref<{ nurseId?: string | undefined; day?: number | undefined; token: number } | null>(null);
const swapDay = ref<number | null>(null);

const current = computed(() => schedules.current);
const published = computed(() => current.value?.status === 'published');
const previous = computed(() => schedules.previousOf(current.value));
const days = computed(() => (current.value ? scheduleDays(current.value) : []));

const periodOptions = computed(() =>
  schedules.list.map((s) => ({ value: s.id, label: formatPeriod(s.startDate, s.endDate), published: s.status === 'published' })),
);

const evaluation = computed(() => (current.value ? evaluateScheduleDoc(current.value, settings.rules, previous.value) : null));

const rows = computed<NurseSnapshot[]>(() => {
  const s = current.value;
  if (!s) return [];
  const q = (search.value ?? '').trim().toLowerCase();
  const list = s.nurseOrder
    .map((id) => s.nurses[id])
    .filter((n): n is NurseSnapshot => !!n)
    .filter((n) => !levelFilter.value.length || levelFilter.value.includes(n.level))
    .filter((n) => !q || n.name.toLowerCase().includes(q) || n.employeeId.toLowerCase().includes(q));
  // Staff nurses see their own row first.
  if (!auth.isManager) list.sort((a, b) => Number(b.id === auth.email) - Number(a.id === auth.email));
  return list;
});

const canRequestSwap = computed(() => auth.isManager || !!current.value?.nurses[auth.email]);
const lockCount = computed(() => Object.values(current.value?.locks ?? {}).reduce((n, l) => n + l.length, 0));
const approvedLeave = computed(() => (current.value ? leaves.approvedBetween(current.value.startDate, current.value.endDate) : []));

function toggleLevel(lv: NurseLevel): void {
  levelFilter.value = levelFilter.value.includes(lv) ? levelFilter.value.filter((x) => x !== lv) : [...levelFilter.value, lv];
}

function focusOn(v: Violation): void {
  focus.value = { nurseId: v.nurseId, day: v.day ?? v.days?.[0], token: Date.now() };
  if (!$q.screen.gt.sm) panelOpen.value = false;
}

async function guard(action: () => Promise<unknown>, success?: string): Promise<void> {
  try {
    await action();
    if (success) Notify.create({ type: 'positive', icon: 'check', message: success });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}

function setCell(nurseId: string, day: number, code: ShiftCode): void {
  if (current.value) void guard(() => schedules.setCell(current.value!, nurseId, day, code, auth.email));
}

function setLock(nurseId: string, day: number, locked: boolean): void {
  if (current.value) void guard(() => schedules.setLock(current.value!, nurseId, day, locked, auth.email));
}

function toggleHoliday(day: number): void {
  if (current.value) void guard(() => schedules.toggleHoliday(current.value!, day, auth.email));
}

function confirm(title: string, message: string, ok = '確定', color = 'primary'): Promise<boolean> {
  return new Promise((resolve) =>
    Dialog.create({
      title,
      message,
      cancel: { flat: true, label: '取消', color: 'grey-8' },
      ok: { unelevated: true, label: ok, color },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false)),
  );
}

async function removeRow(nurseId: string): Promise<void> {
  const s = current.value;
  if (!s) return;
  if (await confirm('移除人員', `將 ${s.nurses[nurseId]?.name ?? nurseId} 自此班表移除？`, '移除', 'negative')) {
    await guard(() => schedules.removeRow(s, nurseId, auth.email), '已移除');
  }
}

async function syncRoster(): Promise<void> {
  const s = current.value;
  if (!s) return;
  await guard(async () => {
    const { added } = await schedules.syncRoster(s, users.list, auth.email);
    Notify.create({ type: 'positive', icon: 'group_add', message: added ? `新增 ${added} 位人員` : '人員資料已更新' });
  });
}

async function clearLocks(): Promise<void> {
  const s = current.value;
  if (s && (await confirm('清除鎖定', `解除 ${lockCount.value} 個鎖定格？`))) {
    await guard(() => schedules.clearLocks(s, auth.email), '已清除鎖定');
  }
}

async function unpublish(): Promise<void> {
  const s = current.value;
  if (s && (await confirm('改回草稿', '護理師將暫時無法看到此班表。'))) {
    await guard(() => schedules.unpublish(s, auth.email), '已改回草稿');
  }
}

async function removeSchedule(): Promise<void> {
  const s = current.value;
  if (s && (await confirm('刪除班表', `刪除 ${formatPeriod(s.startDate, s.endDate)}？此動作無法復原。`, '刪除', 'negative'))) {
    await guard(() => schedules.remove(s), '已刪除');
  }
}

function exportExcel(): void {
  const s = current.value;
  if (!s || !evaluation.value) return;
  const nurses = s.nurseOrder.map((id) => s.nurses[id]).filter((n): n is NurseSnapshot => !!n);
  const filename = exportScheduleXlsx({ wardName: settings.settings.wardName, schedule: s, days: days.value, nurses, evaluation: evaluation.value });
  Notify.create({ type: 'positive', icon: 'download', message: filename });
}

function openSwap(day: number | null): void {
  swapDay.value = day;
  dialogs.swap = true;
}
</script>

<style scoped lang="scss">
.period-select {
  min-width: 250px;
  border-radius: 8px;
}
.issue-btn {
  min-width: 56px;
}
.search {
  min-width: 200px;
  border-radius: 8px;
}
.legend {
  row-gap: 4px;
}
.lock-glyph {
  display: inline-block;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent #6b7280 transparent transparent;
  vertical-align: middle;
}
.empty {
  max-width: 520px;
  margin: 40px auto;
}
</style>
