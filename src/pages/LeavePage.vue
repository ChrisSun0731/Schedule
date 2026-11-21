<template>
  <q-page class="page-pad">
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-icon name="event_busy" size="26px" color="primary" />
      <div class="page-title">請假</div>
      <q-chip dense color="teal-1" text-color="teal-10" icon="low_priority" class="gt-xs">
        優先序：
        <ShiftPill code="AL" dense :tooltip="false" class="q-mx-xs" />›
        <ShiftPill code="OL" dense :tooltip="false" class="q-mx-xs" />›
        <ShiftPill code="REQ" dense :tooltip="false" class="q-ml-xs" />
      </q-chip>
      <q-space />
      <q-btn unelevated no-caps color="primary" icon="add" :label="auth.isManager ? '新增請假' : '申請請假'" @click="openDialog" />
    </div>

    <q-card flat bordered class="list-card">
      <q-tabs v-if="auth.isManager" v-model="tab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="text-grey-8">
        <q-tab name="pending" icon="pending_actions" label="待審核">
          <q-badge v-if="leaves.pending.length" color="negative" floating>{{ leaves.pending.length }}</q-badge>
        </q-tab>
        <q-tab name="all" icon="list" label="全部" />
        <q-tab name="mine" icon="person" label="我的" />
      </q-tabs>
      <q-separator v-if="auth.isManager" />

      <q-list separator>
        <q-item v-for="l in visible" :key="l.id" class="q-py-md">
          <q-item-section avatar>
            <ShiftPill :code="l.type" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">
              <span v-if="auth.isManager">{{ l.nurseName }} · </span>{{ LEAVE_LABELS[l.type] }}
            </q-item-label>
            <q-item-label caption>
              {{ formatMDW(l.startDate) }}<template v-if="l.endDate !== l.startDate"> – {{ formatMDW(l.endDate) }}</template>
              · {{ diffDays(l.startDate, l.endDate) + 1 }} 天
            </q-item-label>
            <q-item-label v-if="l.note" caption class="text-grey-8">{{ l.note }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center no-wrap q-gutter-xs">
              <q-chip dense :color="LEAVE_STATUS_META[l.status].color" text-color="white">{{ LEAVE_STATUS_META[l.status].label }}</q-chip>
              <template v-if="auth.isManager && l.status === 'pending'">
                <q-btn round flat dense icon="close" color="negative" :loading="busy === `${l.id}:r`" @click="decide(l, 'rejected')"><q-tooltip>駁回</q-tooltip></q-btn>
                <q-btn round unelevated dense icon="check" color="positive" :loading="busy === `${l.id}:a`" @click="decide(l, 'approved')"><q-tooltip>核准</q-tooltip></q-btn>
              </template>
              <q-btn v-else-if="l.status === 'pending' && l.nurseId === auth.email" flat dense no-caps color="grey-8" icon="undo" label="撤回" @click="cancel(l)" />
              <q-btn v-if="auth.isManager && l.status !== 'pending'" flat round dense icon="delete_outline" color="grey-6" @click="remove(l)"><q-tooltip>刪除</q-tooltip></q-btn>
            </div>
          </q-item-section>
        </q-item>
        <q-item v-if="!visible.length">
          <q-item-section class="text-center text-grey-6 q-py-xl"><q-icon name="inbox" size="40px" /></q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- Request dialog -->
    <q-dialog v-model="dialog">
      <q-card style="width: 440px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <q-icon name="event_busy" color="primary" size="24px" class="q-mr-sm" />
          <div class="text-h6">{{ auth.isManager ? '新增請假' : '申請請假' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-if="auth.isManager"
            v-model="form.nurseId"
            outlined
            dense
            emit-value
            map-options
            use-input
            :options="nurseOptions"
            label="護理師"
          />
          <q-btn-toggle
            v-model="form.type"
            spread
            no-caps
            unelevated
            toggle-color="primary"
            color="grey-2"
            text-color="grey-9"
            :options="LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_LABELS[t] }))"
          />
          <div class="row justify-center">
            <q-date v-model="range" range mask="YYYY-MM-DD" :locale="dateLocale" minimal flat bordered />
          </div>
          <div class="text-center text-caption text-grey-8">{{ rangeLabel }}</div>
          <q-input v-model="form.note" outlined dense autogrow label="備註（選填）" maxlength="200" />
          <q-banner v-if="auth.isManager" dense rounded class="bg-teal-1 text-teal-10">
            <template #avatar><q-icon name="verified" /></template>
            由護理長新增的請假直接核准
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps color="grey-8" label="取消" />
          <q-btn unelevated no-caps color="primary" icon="send" label="送出" :disable="!canSubmit" :loading="saving" @click="submit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Dialog, Notify } from 'quasar';
import ShiftPill from '@/components/ShiftPill.vue';
import { LEAVE_LABELS, LEAVE_STATUS_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useUsersStore } from '@/stores/users';
import { LEAVE_TYPES, type LeaveRequest, type LeaveType } from '@/types/schedule';
import { diffDays, formatMDW } from '@/utils/dates';
import { dateLocale } from '@/utils/quasarLocale';

const auth = useAuthStore();
const leaves = useLeavesStore();
const users = useUsersStore();

const tab = ref<'pending' | 'all' | 'mine'>(auth.isManager ? 'pending' : 'mine');
const dialog = ref(false);
const saving = ref(false);
const busy = ref<string | null>(null);
const form = reactive<{ nurseId: string | null; type: LeaveType; note: string }>({ nurseId: null, type: 'AL', note: '' });
const range = ref<{ from: string; to: string } | string | null>(null);

const visible = computed(() => {
  if (!auth.isManager || tab.value === 'mine') return leaves.mine;
  return tab.value === 'pending' ? leaves.pending : leaves.list;
});

const nurseOptions = computed(() =>
  users.schedulable.map((u) => ({ value: u.id, label: `${u.displayName}（${u.employeeId}）` })),
);

const dates = computed(() => {
  if (!range.value) return null;
  if (typeof range.value === 'string') return { from: range.value, to: range.value };
  return range.value;
});
const rangeLabel = computed(() =>
  dates.value ? `${formatMDW(dates.value.from)} – ${formatMDW(dates.value.to)} · ${diffDays(dates.value.from, dates.value.to) + 1} 天` : '選擇日期',
);
const canSubmit = computed(() => !!dates.value && (!auth.isManager || !!form.nurseId));

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
  if (!d || !nurseId) return;
  saving.value = true;
  try {
    await leaves.create(
      {
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
  busy.value = `${l.id}:${status === 'approved' ? 'a' : 'r'}`;
  try {
    await leaves.decide(l, status);
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

function remove(l: LeaveRequest): void {
  Dialog.create({
    title: '刪除請假紀錄',
    message: `${l.nurseName} ${formatMDW(l.startDate)}`,
    cancel: { flat: true, label: '取消', color: 'grey-8' },
    ok: { unelevated: true, label: '刪除', color: 'negative' },
  }).onOk(() => void leaves.remove(l).catch((err) => Notify.create({ type: 'negative', message: errorMessage(err) })));
}
</script>

<style scoped lang="scss">
.list-card {
  border-radius: 12px;
  background: #fff;
  max-width: 860px;
}
</style>
