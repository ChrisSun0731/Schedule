<template>
  <q-page class="page page--narrow">
    <PageHeader title="請假" guide="leave">
      <template #actions>
        <q-select
          v-if="wards.mine.length > 1"
          v-model="wardFilter"
          dense
          outlined
          emit-value
          map-options
          options-dense
          aria-label="依病房篩選"
          :options="wardOptions"
          class="bg-surface ward-filter"
        />
        <q-btn unelevated no-caps color="primary" :label="auth.isManager ? '新增請假' : '申請請假'" :disable="!canFile" @click="openDialog" />
      </template>
    </PageHeader>
    <p v-if="!canFile" class="hint q-mb-md">尚未分配病房，無法請假。請聯絡系統管理員把你加入病房。</p>

    <div class="surface list-card">
      <q-tabs v-if="auth.isManager" v-model="tab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="text-muted">
        <q-tab name="pending" label="待審核">
          <q-badge v-if="pending.length" color="negative" floating>{{ pending.length }}</q-badge>
        </q-tab>
        <q-tab name="all" label="全部" />
        <q-tab name="mine" label="我的" />
      </q-tabs>
      <q-separator v-if="auth.isManager" />
      <p class="hint list-hint">{{ tabHint }}</p>

      <q-list separator>
        <q-item v-for="l in visible" :key="l.id" class="q-py-md">
          <q-item-section avatar>
            <ShiftPill :code="l.type" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">
              <span v-if="auth.isManager">{{ l.nurseName }} · </span>{{ LEAVE_LABELS[l.type] }}
            </q-item-label>
            <q-item-label caption class="text-muted">
              {{ formatMDW(l.startDate) }}<template v-if="l.endDate !== l.startDate"> – {{ formatMDW(l.endDate) }}</template>
              · {{ diffDays(l.startDate, l.endDate) + 1 }} 天<template v-if="wards.mine.length > 1"> · {{ wards.nameOf(l.wardId) }}</template>
            </q-item-label>
            <q-item-label v-if="l.note" caption class="text-muted">{{ l.note }}</q-item-label>
            <!-- Actions sit under the text so they never squeeze it on a phone. -->
            <div v-if="wards.canManage(l.wardId) && l.status === 'pending'" class="row q-gutter-sm q-mt-sm">
              <q-btn flat dense no-caps color="negative" icon="close" label="駁回" class="q-px-sm" :loading="busy === `${l.id}:r`" :disable="!!busy" @click="decide(l, 'rejected')" />
              <q-btn unelevated dense no-caps color="positive" icon="check" label="核准" class="q-px-sm" :loading="busy === `${l.id}:a`" :disable="!!busy" @click="decide(l, 'approved')" />
            </div>
            <div v-else-if="l.status === 'pending' && l.nurseId === auth.email" class="q-mt-sm">
              <q-btn flat dense no-caps color="muted" icon="undo" label="撤回申請" class="q-px-sm" @click="cancel(l)" />
            </div>
          </q-item-section>
          <q-item-section side top>
            <div class="row items-center no-wrap q-gutter-xs">
              <q-chip dense :color="LEAVE_STATUS_META[l.status].color" text-color="white" class="q-ma-none">{{ LEAVE_STATUS_META[l.status].label }}</q-chip>
              <q-btn
                v-if="wards.canManage(l.wardId) && l.status !== 'pending'"
                flat
                round
                dense
                icon="delete_outline"
                color="muted"
                :aria-label="`刪除 ${l.nurseName} ${formatMDW(l.startDate)} 的請假紀錄`"
                @click="remove(l)"
              >
                <q-tooltip>刪除</q-tooltip>
              </q-btn>
            </div>
          </q-item-section>
        </q-item>
        <div v-if="!visible.length" class="empty-state">
          <q-icon name="inbox" size="40px" class="text-subtle" />
          <div class="empty-title q-mt-sm">{{ emptyText }}</div>
          <q-btn
            v-if="(tab === 'mine' || !auth.isManager) && canFile"
            unelevated
            no-caps
            color="primary"
            :label="auth.isManager ? '新增請假' : '申請請假'"
            class="q-mt-md"
            @click="openDialog"
          />
        </div>
      </q-list>
    </div>

    <!-- Request dialog -->
    <AppDialog
      v-model="dialog"
      :title="auth.isManager ? '新增請假' : '申請請假'"
      :description="
        auth.isManager
          ? '替病房的護理師登記請假。由護理長新增的請假直接核准，下次自動排班時排入。'
          : `選擇假別與日期後送出，由${myWardId ? ` ${wards.nameOf(myWardId)} ` : ''}護理長審核。核准的假會在自動排班時排入。`
      "
      :width="460"
    >
      <div class="q-gutter-y-md">
        <q-select
          v-if="auth.isManager"
          v-model="form.nurseId"
          aria-required="true"
          outlined
          dense
          emit-value
          map-options
          use-input
          :options="nurseOptions"
          label="護理師"
        />
        <q-select v-model="form.type" outlined dense emit-value map-options :options="typeOptions" label="假別" :hint="typeHint">
          <template #selected-item="{ opt }">
            <ShiftPill :code="opt.value" dense :tooltip="false" class="q-mr-sm" />{{ opt.label }}
          </template>
          <template #option="{ itemProps, opt }">
            <q-item v-bind="itemProps">
              <q-item-section avatar><ShiftPill :code="opt.value" dense :tooltip="false" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ opt.label }}</q-item-label>
                <q-item-label v-if="opt.caption" caption>{{ opt.caption }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <div>
          <div id="leave-dates" class="section-title">日期</div>
          <p class="hint q-mb-sm">點選開始日與結束日；只請一天時，同一天點兩次。</p>
          <div class="row justify-center">
            <q-date v-model="range" range mask="YYYY-MM-DD" :locale="dateLocale" minimal flat bordered aria-labelledby="leave-dates" />
          </div>
          <div class="text-center text-body2 q-mt-sm" aria-live="polite">{{ rangeLabel }}</div>
        </div>
        <q-input v-model="form.note" outlined dense autogrow label="備註（選填）" hint="護理長審核時會看到" maxlength="200" />
      </div>
      <template #actions>
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn unelevated no-caps color="primary" :label="auth.isManager ? '新增' : '送出申請'" :disable="!canSubmit" :loading="saving" @click="submit" />
      </template>
    </AppDialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog, Notify } from 'quasar';
import AppDialog from '@/components/AppDialog.vue';
import PageHeader from '@/components/PageHeader.vue';
import ShiftPill from '@/components/ShiftPill.vue';
import { LEAVE_LABELS, LEAVE_STATUS_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useUsersStore } from '@/stores/users';
import { useWardsStore } from '@/stores/wards';
import {
  DISCRETIONARY_LEAVE_TYPES,
  LEAVE_TYPES,
  isStatutoryLeave,
  type LeaveRequest,
  type LeaveType,
} from '@/types/schedule';
import { diffDays, formatMDW } from '@/utils/dates';
import { dateLocale } from '@/utils/quasarLocale';

const auth = useAuthStore();
const leaves = useLeavesStore();
const users = useUsersStore();
const wards = useWardsStore();

const tab = ref<'pending' | 'all' | 'mine'>(auth.isManager ? 'pending' : 'mine');
const dialog = ref(false);
const saving = ref(false);
const busy = ref<string | null>(null);
const form = reactive<{ nurseId: string | null; type: LeaveType; note: string }>({ nurseId: null, type: 'AL', note: '' });
const typeOptions = LEAVE_TYPES.map((t) => ({
  value: t,
  label: LEAVE_LABELS[t],
  caption: isStatutoryLeave(t) ? '法定假：核准後一律排入' : t === 'REQ' ? '指定休假日，計入例假／休息日' : '',
}));
const range = ref<{ from: string; to: string } | string | null>(null);

/** null = every ward the user works in. */
const wardFilter = ref<string | null>(null);
const wardOptions = computed(() => [{ value: null, label: '全部病房' }, ...wards.mine.map((w) => ({ value: w.id, label: w.name }))]);
const inWard = (items: LeaveRequest[]) => (wardFilter.value ? items.filter((l) => l.wardId === wardFilter.value) : items);
const pending = computed(() => inWard(leaves.pending));

const visible = computed(() => {
  if (!auth.isManager || tab.value === 'mine') return inWard(leaves.mine);
  return tab.value === 'pending' ? pending.value : inWard(leaves.list.filter((l) => wards.canManage(l.wardId)));
});

/** The signed-in nurse's own ward (leave is decided by its head nurse). */
const myWardId = computed(() => auth.profile?.wardIds.find((id) => wards.byId.has(id)) ?? null);

/** Staff on the rosters of the wards I manage, with the ward their leave is filed under. */
const nurseChoices = computed(() => {
  const out: { value: string; label: string; wardId: string }[] = [];
  for (const w of wards.mine.filter((x) => wards.canManage(x.id))) {
    if (wardFilter.value && w.id !== wardFilter.value) continue;
    for (const u of users.rosterOf(w.id)) {
      if (out.some((o) => o.value === u.id)) continue;
      const ward = wards.mine.length > 1 ? ` · ${w.name}` : '';
      out.push({ value: u.id, label: `${u.displayName}（${u.employeeId}）${ward}`, wardId: w.id });
    }
  }
  return out;
});
const nurseOptions = computed(() => nurseChoices.value.map(({ value, label }) => ({ value, label })));

const canFile = computed(() => (auth.isManager ? nurseChoices.value.length > 0 : !!myWardId.value));

const dates = computed(() => {
  if (!range.value) return null;
  if (typeof range.value === 'string') return { from: range.value, to: range.value };
  return range.value;
});
const rangeLabel = computed(() =>
  dates.value ? `${formatMDW(dates.value.from)} – ${formatMDW(dates.value.to)} · ${diffDays(dates.value.from, dates.value.to) + 1} 天` : '選擇日期',
);
const canSubmit = computed(() => !!dates.value && (auth.isManager ? !!form.nurseId : !!myWardId.value));

/** What the selected leave type means for scheduling. */
const typeHint = computed(() => {
  const t = form.type;
  if (isStatutoryLeave(t)) return '法定假：核准後一律排入班表，人力不足時由護理長補人。';
  if (t === 'REQ') return '預假：指定希望休息的日子，算作休息日，在人力許可時排入。';
  const order = DISCRETIONARY_LEAVE_TYPES.map((x) => LEAVE_LABELS[x].replace(/（.*）/, '')).join(' › ');
  return `人力許可時排入，排入順序為 ${order}。`;
});

/** One sentence about the list under the tabs. */
const tabHint = computed(() => {
  if (!auth.isManager || tab.value === 'mine') return '你的請假申請與審核結果。待審核的申請可以撤回。';
  if (tab.value === 'pending') return '等待你審核的請假。核准後會在下次自動排班時排入。';
  return '你負責病房的所有請假紀錄。';
});

const emptyText = computed(() => {
  if (auth.isManager && tab.value === 'pending') return '沒有待審核的請假';
  if (auth.isManager && tab.value === 'all') return '尚無請假紀錄';
  return '還沒有請假紀錄';
});

function confirmDialog(title: string, message: string, ok: string, color: string): Promise<boolean> {
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

function openDialog(): void {
  form.nurseId = auth.isManager ? null : auth.email;
  form.type = 'AL';
  form.note = '';
  range.value = null;
  dialog.value = true;
}

async function submit(): Promise<void> {
  const d = dates.value;
  const nurseId = auth.isManager ? form.nurseId : auth.email;
  const wardId = auth.isManager ? nurseChoices.value.find((o) => o.value === nurseId)?.wardId : myWardId.value;
  if (!d || !nurseId || !wardId) return;
  saving.value = true;
  try {
    await leaves.create(
      {
        wardId,
        nurseId,
        nurseName: users.byId.get(nurseId)?.displayName ?? auth.displayName,
        type: form.type,
        startDate: d.from,
        endDate: d.to,
        note: form.note.trim(),
      },
      auth.isManager,
    );
    Notify.create({ type: 'positive', icon: 'check', message: auth.isManager ? '已新增' : '已送出申請' });
    dialog.value = false;
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    saving.value = false;
  }
}

async function decide(l: LeaveRequest, status: 'approved' | 'rejected'): Promise<void> {
  // A decision cannot be changed afterwards in the app, so a rejection is confirmed first.
  if (status === 'rejected') {
    const range = l.endDate !== l.startDate ? `${formatMDW(l.startDate)} – ${formatMDW(l.endDate)}` : formatMDW(l.startDate);
    if (!(await confirmDialog('駁回請假', `駁回 ${l.nurseName} 的${LEAVE_LABELS[l.type]}（${range}）？`, '駁回', 'negative'))) return;
  }
  busy.value = `${l.id}:${status === 'approved' ? 'a' : 'r'}`;
  try {
    await leaves.decide(l, status);
    Notify.create({ type: status === 'approved' ? 'positive' : 'info', message: status === 'approved' ? `已核准 ${l.nurseName} 的請假` : `已駁回 ${l.nurseName} 的請假` });
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    busy.value = null;
  }
}

async function cancel(l: LeaveRequest): Promise<void> {
  try {
    await leaves.cancel(l);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}

async function remove(l: LeaveRequest): Promise<void> {
  if (!(await confirmDialog('刪除請假紀錄', `刪除 ${l.nurseName} ${formatMDW(l.startDate)} 的${LEAVE_LABELS[l.type]}紀錄？此動作無法復原。`, '刪除', 'negative'))) return;
  try {
    await leaves.remove(l);
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  }
}
</script>

<style scoped lang="scss">
.ward-filter {
  min-width: 150px;
  @media (max-width: 599px) {
    flex: 1 1 40%;
  }
}
.list-card {
  overflow: hidden;
  :deep(.q-tab) {
    min-height: 44px;
  }
}
.list-hint {
  padding: 12px 16px 0;
}
</style>
