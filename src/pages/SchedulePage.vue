<template>
  <q-page class="page-pad">
    <!-- One tab per ward for head nurses with several wards (and developers) -->
    <q-tabs
      v-if="wards.mine.length > 1"
      :model-value="ward?.id"
      dense
      no-caps
      inline-label
      align="left"
      outside-arrows
      mobile-arrows
      active-color="primary"
      indicator-color="primary"
      class="ward-tabs text-muted q-mb-sm"
      aria-label="病房"
      @update:model-value="wards.select"
    >
      <q-tab v-for="w in wards.mine" :key="w.id" :name="w.id" icon="apartment" :label="w.name">
        <q-badge v-if="pendingByWard.get(w.id)" color="negative" floating :aria-label="`${pendingByWard.get(w.id)} 件待審核`">
          {{ pendingByWard.get(w.id) }}
        </q-badge>
      </q-tab>
    </q-tabs>

    <!-- Toolbar -->
    <div v-if="ward" class="toolbar q-mb-sm">
      <div class="toolbar-period">
        <q-select
          :model-value="schedules.selectedId"
          dense
          outlined
          emit-value
          map-options
          options-dense
          :options="periodOptions"
          class="period-select bg-surface"
          :aria-label="`${ward.name} 排班週期`"
          :disable="!schedules.wardList.length"
          @update:model-value="schedules.select"
        >
          <template #prepend><q-icon name="calendar_month" color="primary" /></template>
          <template #option="{ itemProps, opt }">
            <q-item v-bind="itemProps">
              <q-item-section>{{ opt.label }}</q-item-section>
              <q-item-section side>
                <q-badge :color="opt.published ? 'positive' : 'muted'">{{ opt.published ? '已發布' : '草稿' }}</q-badge>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <q-chip
          v-if="current"
          :color="published ? 'positive' : 'muted'"
          text-color="white"
          :icon="published ? 'verified' : 'edit_note'"
          class="q-ma-none no-shrink"
        >
          {{ published ? '已發布' : '草稿' }}
        </q-chip>
      </div>

      <div class="toolbar-actions">
        <q-btn-toggle
          v-if="current && myRow"
          v-model="view"
          dense
          no-caps
          unelevated
          toggle-color="primary"
          color="soft"
          text-color="ink"
          class="view-toggle"
          aria-label="檢視方式"
          :options="[
            { label: '我的班表', value: 'mine' },
            { label: '全體班表', value: 'ward' },
          ]"
        />

        <template v-if="current && evaluation && shownView === 'ward'">
          <q-btn
            dense
            unelevated
            no-caps
            :color="evaluation.errorCount ? 'error-soft' : 'ok-soft'"
            :text-color="evaluation.errorCount ? 'negative' : 'positive'"
            :icon="evaluation.errorCount ? 'error' : 'task_alt'"
            :label="$q.screen.gt.xs ? `錯誤 ${evaluation.errorCount}` : String(evaluation.errorCount)"
            :aria-label="`規則錯誤 ${evaluation.errorCount} 項，開啟規則檢查`"
            class="issue-btn"
            @click="togglePanel"
          />
          <q-btn
            dense
            unelevated
            no-caps
            color="warn-soft"
            text-color="on-warn"
            icon="warning"
            :label="$q.screen.gt.xs ? `警告 ${evaluation.warningCount}` : String(evaluation.warningCount)"
            :aria-label="`警告 ${evaluation.warningCount} 項，開啟規則檢查`"
            class="issue-btn"
            @click="togglePanel"
          />
        </template>

        <div v-if="manage && current && shownView === 'ward'" class="row no-wrap" role="group" aria-label="編輯紀錄">
          <q-btn
            flat
            round
            dense
            icon="undo"
            :disable="!history.canUndo.value || history.busy.value"
            :aria-label="history.canUndo.value ? `復原：${history.undoLabel.value}` : '復原'"
            @click="runHistory('undo')"
          >
            <q-tooltip>{{ history.canUndo.value ? `復原：${history.undoLabel.value}` : '沒有可復原的變更' }}（{{ modKey }}Z）</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="redo"
            :disable="!history.canRedo.value || history.busy.value"
            :aria-label="history.canRedo.value ? `重做：${history.redoLabel.value}` : '重做'"
            @click="runHistory('redo')"
          >
            <q-tooltip>{{ history.canRedo.value ? `重做：${history.redoLabel.value}` : '沒有可重做的變更' }}（{{ modKey }}⇧Z）</q-tooltip>
          </q-btn>
        </div>

        <q-space />

        <template v-if="manage && wide">
          <q-btn outline no-caps color="primary" icon="add" label="新增週期" @click="dialogs.create = true" />
          <template v-if="current">
            <q-btn outline no-caps color="primary" icon="auto_fix_high" label="自動排班" @click="dialogs.generate = true" />
            <q-btn outline no-caps color="primary" icon="table_view" label="匯出 Excel" @click="exportExcel" />
          </template>
        </template>
        <q-btn
          v-if="current && published && canRequestSwap"
          outline
          no-caps
          color="primary"
          icon="swap_horiz"
          label="申請換班"
          @click="openSwap(null)"
        />
        <q-btn
          v-if="manage && current"
          unelevated
          no-caps
          color="primary"
          :icon="published ? 'forward_to_inbox' : 'campaign'"
          :label="published ? '重新通知' : '發布並通知'"
          @click="dialogs.publish = true"
        />
        <q-btn v-if="manage" flat round dense icon="more_vert" aria-label="更多動作">
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 220px">
              <template v-if="!wide">
                <q-item v-close-popup clickable @click="dialogs.create = true">
                  <q-item-section avatar><q-icon name="add" /></q-item-section>
                  <q-item-section>新增週期</q-item-section>
                </q-item>
                <template v-if="current">
                  <q-item v-close-popup clickable @click="dialogs.generate = true">
                    <q-item-section avatar><q-icon name="auto_fix_high" /></q-item-section>
                    <q-item-section>自動排班</q-item-section>
                  </q-item>
                  <q-item v-close-popup clickable @click="exportExcel">
                    <q-item-section avatar><q-icon name="table_view" /></q-item-section>
                    <q-item-section>匯出 Excel</q-item-section>
                  </q-item>
                </template>
                <q-separator v-if="current" />
              </template>
              <template v-if="current">
                <q-item v-close-popup clickable @click="syncRoster">
                  <q-item-section avatar><q-icon name="group_add" /></q-item-section>
                  <q-item-section>同步人員名單</q-item-section>
                </q-item>
                <q-item v-close-popup clickable :disable="!lockCount" @click="clearLocks">
                  <q-item-section avatar><q-icon name="lock_open" /></q-item-section>
                  <q-item-section>
                    <q-item-label>清除全部鎖定</q-item-label>
                    <q-item-label caption>{{ lockCount ? `${lockCount} 格，可復原` : '目前沒有鎖定的格子' }}</q-item-label>
                  </q-item-section>
                </q-item>
                <q-item v-if="published" v-close-popup clickable @click="unpublish">
                  <q-item-section avatar><q-icon name="unpublished" /></q-item-section>
                  <q-item-section>改回草稿</q-item-section>
                </q-item>
                <q-separator />
                <q-item v-close-popup clickable class="text-negative" :disable="!canDelete" @click="removeSchedule">
                  <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                  <q-item-section>
                    <q-item-label>刪除班表</q-item-label>
                    <q-item-label v-if="!canDelete" caption>已發布的班表僅系統管理員可刪除</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <!-- Filters + legend (ward view) -->
    <div v-if="current && shownView === 'ward'" class="filters q-mb-sm">
      <q-input
        v-model="search"
        dense
        outlined
        clearable
        placeholder="搜尋姓名 / 編號"
        aria-label="搜尋姓名或員工編號"
        class="bg-surface search"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <div class="row items-center no-wrap q-gutter-xs" role="group" aria-label="依職級篩選">
        <q-btn
          v-for="lv in NURSE_LEVELS"
          :key="lv"
          dense
          unelevated
          no-caps
          :color="levelFilter.includes(lv) ? 'primary' : 'soft'"
          :text-color="levelFilter.includes(lv) ? 'white' : 'ink'"
          :label="lv"
          :aria-pressed="levelFilter.includes(lv)"
          class="level-btn"
          @click="toggleLevel(lv)"
        />
      </div>
      <q-toggle v-model="showIssues" dense color="primary" label="標示違規" />
      <div class="legend">
        <span v-for="c in legendCodes" :key="c" class="row items-center no-wrap">
          <ShiftPill :code="c" dense :tooltip="false" />
          <span class="q-ml-xs text-caption text-muted">{{ SHIFT_META[c].label }}</span>
        </span>
        <span v-if="manage" class="text-caption text-muted gt-sm row items-center no-wrap">
          <span class="lock-glyph q-mr-xs" aria-hidden="true" />鎖定 · 鍵盤快捷鍵見班別選單
        </span>
      </div>
    </div>

    <!-- Content -->
    <div v-if="!schedules.loaded || !wards.loaded || !users.loaded" class="q-pa-xl flex flex-center">
      <q-spinner-dots size="40px" color="primary" aria-label="載入中" />
    </div>

    <div v-else-if="!ward" class="surface empty-state empty-box">
      <q-icon name="apartment" size="48px" class="text-subtle" />
      <div class="empty-title q-mt-sm">{{ auth.isDeveloper ? '尚未建立病房' : '尚未分配病房' }}</div>
      <div class="text-body2 q-mt-xs">
        {{ auth.isDeveloper ? '先建立病房並指派人員，才能開始排班。' : '請系統管理員在「人員管理」把你加入病房，加入後即可看到班表。' }}
      </div>
      <q-btn v-if="auth.isDeveloper" unelevated no-caps color="primary" icon="apartment" label="前往病房" class="q-mt-md" :to="{ name: 'wards' }" />
    </div>

    <div v-else-if="!current" class="surface empty-state empty-box">
      <q-icon name="event_note" size="48px" class="text-subtle" />
      <div class="empty-title q-mt-sm">{{ manage ? `${ward.name}尚無班表` : `${ward.name}尚無已發布的班表` }}</div>
      <div class="text-body2 q-mt-xs">
        {{ manage ? '建立 28 天的排班週期後，即可自動排班並發布給護理師。' : '護理長發布班表後會顯示在這裡，並寄送 Email 通知你。' }}
      </div>
      <q-btn v-if="manage" unelevated no-caps color="primary" icon="add" label="建立排班週期" class="q-mt-md" @click="dialogs.create = true" />
    </div>

    <template v-else-if="evaluation">
      <MySchedule
        v-if="shownView === 'mine'"
        :schedule="current"
        :days="days"
        :nurse-id="auth.email"
        :evaluation="evaluation"
        :rules="rules"
        :can-swap="published && canRequestSwap"
        @swap="openSwap"
      />
      <div v-else class="row no-wrap q-col-gutter-md">
        <div class="col" style="min-width: 0">
          <ScheduleGrid
            :schedule="current"
            :days="days"
            :rows="rows"
            :evaluation="evaluation"
            :editable="manage"
            :me-id="auth.email"
            :show-issues="showIssues"
            :show-summary="manage || wide"
            :focus="focus"
            @set-cell="setCell"
            @set-lock="setLock"
            @toggle-holiday="toggleHoliday"
            @remove-row="removeRow"
            @open-issues="openIssues"
            @swap="openSwap"
          />
        </div>
        <div v-if="panelOpen && wide" class="col-auto" style="width: 320px">
          <ViolationPanel :evaluation="evaluation" :nurse-id="panelNurse" :nurse-name="panelNurse ? current?.nurses[panelNurse]?.name : undefined" @close="closePanel" @focus="focusOn" @clear-nurse="panelNurse = null" />
        </div>
      </div>
      <div class="text-caption text-muted q-mt-xs row q-gutter-x-md">
        <span>更新 {{ formatDateTime(current.updatedAt) }} · {{ current.updatedBy }}</span>
        <span v-if="current.publishedAt">發布 {{ formatDateTime(current.publishedAt) }}</span>
      </div>
    </template>

    <q-dialog v-if="evaluation" :model-value="panelOpen && !wide" position="bottom" @update:model-value="(v: boolean) => (v ? (panelOpen = true) : closePanel())">
      <div style="width: 100%; height: 70vh">
        <ViolationPanel :evaluation="evaluation" :nurse-id="panelNurse" :nurse-name="panelNurse ? current?.nurses[panelNurse]?.name : undefined" @close="closePanel" @focus="focusOn" @clear-nurse="panelNurse = null" />
      </div>
    </q-dialog>

    <!-- Dialogs -->
    <NewScheduleDialog v-if="ward" v-model="dialogs.create" :ward="ward" />
    <GenerateDialog
      v-if="current"
      v-model="dialogs.generate"
      :schedule="current"
      :previous="previous"
      :rules="rules"
      :leave-requests="approvedLeave"
      @applied="(before, after) => history.recordBulk('自動排班', before, after)"
    />
    <PublishDialog v-if="current && evaluation" v-model="dialogs.publish" :schedule="current" :evaluation="evaluation" />
    <SwapRequestDialog v-if="current && published" v-model="dialogs.swap" :schedule="current" :initial-day="swapDay" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Dialog, Notify, useQuasar } from 'quasar';
import GenerateDialog from '@/components/GenerateDialog.vue';
import MySchedule from '@/components/MySchedule.vue';
import NewScheduleDialog from '@/components/NewScheduleDialog.vue';
import PublishDialog from '@/components/PublishDialog.vue';
import ScheduleGrid from '@/components/ScheduleGrid.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import SwapRequestDialog from '@/components/SwapRequestDialog.vue';
import ViolationPanel from '@/components/ViolationPanel.vue';
import { cellState, snapshotOf, useScheduleUndo } from '@/composables/useScheduleUndo';
import { SHIFT_META } from '@/constants/labels';
import { exportScheduleXlsx } from '@/services/excelExport';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useSchedulesStore } from '@/stores/schedules';
import { useSwapsStore } from '@/stores/swaps';
import { useUsersStore } from '@/stores/users';
import { useWardsStore } from '@/stores/wards';
import { NURSE_LEVELS, SHIFT_CODES, type NurseLevel, type NurseSnapshot, type ShiftCode, type Violation } from '@/types/schedule';
import { formatDateTime, formatMD, formatPeriod } from '@/utils/dates';
import { evaluateScheduleDoc, scheduleDays } from '@/utils/scheduleHelpers';

const $q = useQuasar();
const auth = useAuthStore();
const schedules = useSchedulesStore();
const wards = useWardsStore();
const swaps = useSwapsStore();
const leaves = useLeavesStore();
const users = useUsersStore();

const dialogs = reactive({ create: false, generate: false, publish: false, swap: false });
const panelOpen = ref(false);
const panelNurse = ref<string | null>(null);
const showIssues = ref(auth.isManager);
const search = ref<string | null>('');
const levelFilter = ref<NurseLevel[]>([]);
const focus = ref<{ nurseId?: string | undefined; day?: number | undefined; token: number } | null>(null);
const swapDay = ref<number | null>(null);

/** Desktop width: side panel, full toolbar, coverage summary for everyone. */
const wide = computed(() => $q.screen.gt.sm);
const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const ward = computed(() => wards.current);
/** May edit, generate and publish this ward's schedules. */
const manage = computed(() => wards.canManage(ward.value?.id));
/** Hospital-wide labour rules + this ward's staffing demand. */
const rules = computed(() => wards.rulesFor(ward.value?.id));
const current = computed(() => schedules.current);
const published = computed(() => current.value?.status === 'published');
const previous = computed(() => schedules.previousOf(current.value));
const days = computed(() => (current.value ? scheduleDays(current.value) : []));
const myRow = computed(() => !!current.value?.nurses[auth.email]);
/** The everyday codes, plus any other leave type that appears in this roster. */
const LEGEND_ALWAYS = new Set<ShiftCode>(['D', 'E', 'N', 'OFF', 'AL', 'OL', 'REQ']);
const legendCodes = computed(() => {
  const used = new Set(Object.values(current.value?.assignments ?? {}).flat());
  return SHIFT_CODES.filter((c) => LEGEND_ALWAYS.has(c) || used.has(c));
});

// Staff nurses on a phone start on their own calendar; everyone can switch.
const view = ref<'mine' | 'ward'>(!auth.isManager && $q.screen.lt.md ? 'mine' : 'ward');
const shownView = computed(() => (myRow.value ? view.value : 'ward'));

const periodOptions = computed(() =>
  schedules.wardList.map((s) => ({ value: s.id, label: formatPeriod(s.startDate, s.endDate), published: s.status === 'published' })),
);

/** Swaps and leave waiting for the signed-in head nurse, per ward (tab badges). */
const pendingByWard = computed(() => {
  const m = new Map<string, number>();
  for (const x of [...swaps.review, ...leaves.pending]) m.set(x.wardId, (m.get(x.wardId) ?? 0) + 1);
  return m;
});

const evaluation = computed(() => (current.value ? evaluateScheduleDoc(current.value, rules.value, previous.value) : null));

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
  if (!manage.value) list.sort((a, b) => Number(b.id === auth.email) - Number(a.id === auth.email));
  return list;
});

const canRequestSwap = computed(() => manage.value || myRow.value);
const canDelete = computed(() => !published.value || auth.isDeveloper);
const lockCount = computed(() => Object.values(current.value?.locks ?? {}).reduce((n, l) => n + l.length, 0));
const approvedLeave = computed(() =>
  current.value ? leaves.approvedBetween(current.value.startDate, current.value.endDate, current.value.nurseOrder) : [],
);

function toggleLevel(lv: NurseLevel): void {
  levelFilter.value = levelFilter.value.includes(lv) ? levelFilter.value.filter((x) => x !== lv) : [...levelFilter.value, lv];
}

// ---------------------------------------------------------------------------
// Rule-check panel
// ---------------------------------------------------------------------------

function togglePanel(): void {
  panelNurse.value = null;
  panelOpen.value = !panelOpen.value;
}

function openIssues(nurseId: string): void {
  panelNurse.value = nurseId;
  panelOpen.value = true;
}

function closePanel(): void {
  panelOpen.value = false;
  panelNurse.value = null;
}

function focusOn(v: Violation): void {
  focus.value = { nurseId: v.nurseId, day: v.day ?? v.days?.[0], token: Date.now() };
  if (!wide.value) panelOpen.value = false;
}

// ---------------------------------------------------------------------------
// Editing with undo
// ---------------------------------------------------------------------------

async function guard(action: () => Promise<unknown>, success?: string): Promise<void> {
  try {
    await action();
    if (success) Notify.create({ type: 'positive', icon: 'check', message: success });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}

const history = useScheduleUndo(current, () => auth.email, (entry) => {
  // Show what changed, even when it is scrolled out of view.
  if (entry.kind === 'cell') focus.value = { nurseId: entry.nurseId, day: entry.day, token: Date.now() };
});

function runHistory(direction: 'undo' | 'redo'): Promise<void> {
  return guard(() => (direction === 'undo' ? history.undo() : history.redo()));
}

function cellName(nurseId: string, day: number): string {
  const s = current.value;
  return `${s?.nurses[nurseId]?.name ?? nurseId} ${days.value[day] ? formatMD(days.value[day].date) : ''}`;
}

function setCell(nurseId: string, day: number, code: ShiftCode): void {
  const s = current.value;
  if (!s) return;
  const before = cellState(s, nurseId, day);
  void guard(() => history.setCell(nurseId, day, { code, locked: true }, `${cellName(nurseId, day)} ${before.code}→${code}`));
}

function setLock(nurseId: string, day: number, locked: boolean): void {
  const s = current.value;
  if (!s) return;
  const before = cellState(s, nurseId, day);
  void guard(() => history.setCell(nurseId, day, { code: before.code, locked }, `${cellName(nurseId, day)} ${locked ? '鎖定' : '解除鎖定'}`));
}

function onKeydown(ev: KeyboardEvent): void {
  if (!manage.value || shownView.value !== 'ward' || ev.altKey || !(ev.metaKey || ev.ctrlKey)) return;
  const target = ev.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (document.querySelector('.q-dialog')) return;
  const key = ev.key.toLowerCase();
  if (key === 'z' && !ev.shiftKey) {
    ev.preventDefault();
    void runHistory('undo');
  } else if ((key === 'z' && ev.shiftKey) || (key === 'y' && ev.ctrlKey)) {
    ev.preventDefault();
    void runHistory('redo');
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function toggleHoliday(day: number): void {
  if (current.value) void guard(() => schedules.toggleHoliday(current.value!, day, auth.email));
}

/** Confirmation for actions that cannot be undone. `ok` names the action – never 「確定」. */
function confirm(title: string, message: string, ok: string, color = 'primary'): Promise<boolean> {
  return new Promise((resolve) =>
    Dialog.create({
      title,
      message,
      cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
      ok: { unelevated: true, noCaps: true, label: ok, color },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false)),
  );
}

async function removeRow(nurseId: string): Promise<void> {
  const s = current.value;
  if (!s) return;
  if (await confirm('移除人員', `將 ${s.nurses[nurseId]?.name ?? nurseId} 自此班表移除？其班別會一併刪除。`, '移除', 'negative')) {
    await guard(() => schedules.removeRow(s, nurseId, auth.email), '已移除');
  }
}

async function syncRoster(): Promise<void> {
  const s = current.value;
  if (!s) return;
  await guard(async () => {
    const { added } = await schedules.syncRoster(s, users.list, users.rosterOf(s.wardId), auth.email);
    Notify.create({ type: 'positive', icon: 'group_add', message: added ? `新增 ${added} 位人員` : '人員資料已更新' });
  });
}

/** Undoable, so no confirmation – the toolbar's undo (or the toast's 復原) puts the locks back. */
async function clearLocks(): Promise<void> {
  const s = current.value;
  if (!s) return;
  const before = snapshotOf(s);
  const label = `清除 ${lockCount.value} 個鎖定`;
  await guard(async () => {
    await schedules.clearLocks(s, auth.email);
    history.recordBulk(label, before, { assignments: before.assignments, locks: {} });
    Notify.create({
      type: 'positive',
      icon: 'lock_open',
      message: `已${label}`,
      timeout: 6000,
      actions: [{ label: '復原', noCaps: true, handler: () => void (history.undoLabel.value === label && runHistory('undo')) }],
    });
  });
}

async function unpublish(): Promise<void> {
  const s = current.value;
  if (s && (await confirm('改回草稿', '護理師將暫時無法看到此班表，重新發布後才會恢復。', '改回草稿'))) {
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
  const filename = exportScheduleXlsx({ wardName: wards.nameOf(s.wardId), schedule: s, days: days.value, nurses, evaluation: evaluation.value });
  Notify.create({ type: 'positive', icon: 'download', message: `已下載 ${filename}` });
}

function openSwap(day: number | null): void {
  swapDay.value = day;
  dialogs.swap = true;
}
</script>

<style scoped lang="scss">
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.toolbar-period {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 18rem;
  max-width: 28rem;
  min-width: 0;
  @media (max-width: 599px) {
    max-width: none;
  }
}
.period-select {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 8px;
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 999 1 auto;
}
.issue-btn {
  min-width: 3.5rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.search {
  min-width: 200px;
  border-radius: 8px;
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}
.level-btn {
  min-width: 2.5rem;
  min-height: 2rem;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-left: auto;
  @media (max-width: 1023px) {
    margin-left: 0;
  }
}
.lock-glyph {
  display: inline-block;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent var(--text-3) transparent transparent;
}
.empty-box {
  max-width: 520px;
  margin: 40px auto;
}
.ward-tabs {
  border-bottom: 1px solid var(--line);
  :deep(.q-tab) {
    min-height: 44px;
  }
}
</style>
