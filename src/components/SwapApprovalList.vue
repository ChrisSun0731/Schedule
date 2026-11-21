<template>
  <div class="q-gutter-y-sm">
    <q-card
      v-for="s in items"
      :key="s.id"
      flat
      bordered
      class="swap-card"
      :class="{ highlight: s.id === highlightId }"
      :data-swap="s.id"
    >
      <q-card-section class="q-py-sm">
        <div class="row items-center no-wrap q-gutter-x-sm">
          <q-chip
            dense
            :color="SWAP_STATUS_META[s.status].color"
            text-color="white"
            :icon="SWAP_STATUS_META[s.status].icon"
            class="q-ml-none"
          >
            {{ SWAP_STATUS_META[s.status].label }}
          </q-chip>
          <span class="text-caption text-grey-7 ellipsis">{{ formatDateTime(s.createdAt) }}</span>
          <q-space />
          <q-icon
            v-if="s.emailStatus"
            :name="s.emailStatus === 'sent' ? 'mark_email_read' : 'mark_email_unread'"
            :color="s.emailStatus === 'sent' ? 'positive' : 'negative'"
            size="18px"
          >
            <q-tooltip>{{ s.emailStatus === 'sent' ? '通知信已送出' : '通知信寄送失敗' }}</q-tooltip>
          </q-icon>
        </div>

        <div class="swap-row q-mt-sm">
          <div class="party">
            <div class="party-name ellipsis">{{ s.requesterName }}<span class="emp">{{ s.requesterEmployeeId }}</span></div>
            <div class="row items-center q-gutter-x-xs">
              <span class="text-caption">{{ formatMDW(s.requesterDate) }}</span>
              <ShiftPill :code="s.requesterShift" dense />
            </div>
          </div>
          <q-icon name="swap_horiz" size="26px" color="primary" class="q-mx-sm" />
          <div class="party">
            <div class="party-name ellipsis">{{ s.targetName }}<span class="emp">{{ s.targetEmployeeId }}</span></div>
            <div class="row items-center q-gutter-x-xs">
              <span class="text-caption">{{ formatMDW(s.targetDate) }}</span>
              <ShiftPill :code="s.targetShift" dense />
            </div>
          </div>
        </div>

        <div v-if="s.note" class="quote q-mt-sm">{{ s.note }}</div>
        <div v-if="s.responseNote" class="quote reply q-mt-xs">{{ s.responseNote }}</div>

        <div v-if="warningsFor(s).length" class="warn-box q-mt-sm">
          <div v-for="(w, i) in warningsFor(s)" :key="i" class="row no-wrap items-start">
            <q-icon name="warning" color="warning" size="14px" class="q-mr-xs q-mt-xs" />
            <span>{{ w }}</span>
          </div>
        </div>
        <div v-if="blockedFor(s)" class="text-negative text-caption q-mt-xs row items-center">
          <q-icon name="block" size="14px" class="q-mr-xs" />{{ blockedFor(s) }}
        </div>
      </q-card-section>

      <q-card-actions v-if="actionsFor(s).length" align="right" class="q-pt-none">
        <q-btn
          v-for="a in actionsFor(s)"
          :key="a.key"
          :flat="!a.primary"
          :unelevated="a.primary"
          no-caps
          :color="a.color"
          :icon="a.icon"
          :label="a.label"
          :loading="busyId === `${s.id}:${a.key}`"
          :disable="!!busyId || (a.primary && !!blockedFor(s))"
          @click="run(s, a.key)"
        />
      </q-card-actions>
    </q-card>

    <div v-if="!items.length" class="empty text-center text-grey-6 q-py-xl">
      <q-icon name="inbox" size="40px" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Dialog, Notify } from 'quasar';
import ShiftPill from '@/components/ShiftPill.vue';
import { SWAP_STATUS_META } from '@/constants/labels';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useSwapsStore } from '@/stores/swaps';
import type { SwapRequest } from '@/types/schedule';
import { formatDateTime, formatMDW } from '@/utils/dates';
import { checkSwap } from '@/utils/scheduleHelpers';

const props = defineProps<{ items: SwapRequest[]; highlightId?: string | null }>();

type ActionKey = 'approve' | 'reject' | 'cancel' | 'decide-approve' | 'decide-reject';

const auth = useAuthStore();
const schedules = useSchedulesStore();
const settings = useSettingsStore();
const swaps = useSwapsStore();
const busyId = ref<string | null>(null);

const pending = (s: SwapRequest) => s.status === 'pending_target' || s.status === 'pending_head';

/** Live rule check of every pending swap against the current schedule (memoised per render). */
const checks = computed(() => {
  const map = new Map<string, ReturnType<typeof checkSwap>>();
  for (const s of props.items) {
    if (!pending(s)) continue;
    const schedule = schedules.list.find((x) => x.id === s.scheduleId);
    if (schedule) map.set(s.id, checkSwap(schedule, s, settings.rules, schedules.previousOf(schedule)));
  }
  return map;
});

function blockedFor(s: SwapRequest): string | null {
  return checks.value.get(s.id)?.blocked ?? null;
}

function warningsFor(s: SwapRequest): string[] {
  if (s.warnings?.length) return s.warnings;
  const check = checks.value.get(s.id);
  return check && !check.blocked ? check.introduced.map((v) => v.message) : [];
}

function actionsFor(s: SwapRequest) {
  const out: { key: ActionKey; label: string; icon: string; color: string; primary: boolean }[] = [];
  if (!pending(s)) return out;
  if (s.status === 'pending_target' && s.targetId === auth.email) {
    out.push({ key: 'reject', label: '拒絕', icon: 'close', color: 'negative', primary: false });
    out.push({ key: 'approve', label: '同意', icon: 'check', color: 'positive', primary: true });
  } else if (auth.isManager) {
    out.push({ key: 'decide-reject', label: '駁回', icon: 'close', color: 'negative', primary: false });
    out.push({ key: 'decide-approve', label: '核准', icon: 'verified', color: 'primary', primary: true });
  }
  if (s.requesterId === auth.email) out.unshift({ key: 'cancel', label: '撤回', icon: 'undo', color: 'grey-8', primary: false });
  return out;
}

function askNote(title: string): Promise<string | null> {
  return new Promise((resolve) => {
    Dialog.create({
      title,
      prompt: { model: '', type: 'text', outlined: true, dense: true, label: '回覆（選填）' },
      cancel: { flat: true, label: '取消', color: 'grey-8' },
      ok: { unelevated: true, label: '確定', color: 'primary' },
    })
      .onOk((v: string) => resolve(v ?? ''))
      .onCancel(() => resolve(null));
  });
}

async function run(s: SwapRequest, key: ActionKey): Promise<void> {
  let note = '';
  if (key === 'reject' || key === 'decide-reject') {
    const v = await askNote('拒絕換班');
    if (v === null) return;
    note = v;
  }
  if (key === 'decide-approve' && warningsFor(s).length) {
    const ok = await new Promise<boolean>((resolve) =>
      Dialog.create({
        title: '核准換班',
        message: `換班後有 ${warningsFor(s).length} 項規則問題，仍要核准？`,
        cancel: { flat: true, label: '取消', color: 'grey-8' },
        ok: { unelevated: true, label: '核准', color: 'primary' },
      })
        .onOk(() => resolve(true))
        .onCancel(() => resolve(false)),
    );
    if (!ok) return;
  }
  busyId.value = `${s.id}:${key}`;
  try {
    if (key === 'cancel') {
      await swaps.cancel(s);
      Notify.create({ type: 'info', message: '已撤回' });
    } else if (key === 'approve' || key === 'reject') {
      const status = await swaps.respond(s, key === 'approve', note);
      Notify.create({
        type: status === 'approved' ? 'positive' : status === 'pending_head' ? 'warning' : 'info',
        message: status === 'approved' ? '已同意，班表已更新' : status === 'pending_head' ? '已同意，送護理長審核' : '已拒絕',
      });
    } else {
      const status = await swaps.decide(s, key === 'decide-approve', note);
      Notify.create({ type: status === 'approved' ? 'positive' : 'info', message: status === 'approved' ? '已核准，班表已更新' : '已駁回' });
    }
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    busyId.value = null;
  }
}
</script>

<style scoped lang="scss">
.swap-card {
  border-radius: 12px;
  transition: box-shadow 0.3s;
  &.highlight {
    box-shadow: 0 0 0 2px #0f6e72;
  }
}
.swap-row {
  display: flex;
  align-items: center;
}
.party {
  flex: 1;
  min-width: 0;
}
.party-name {
  font-weight: 600;
  .emp {
    font-weight: 400;
    font-size: 11px;
    color: #9aa5b1;
    margin-left: 6px;
  }
}
.quote {
  font-size: 13px;
  color: #52606d;
  padding: 6px 10px;
  border-left: 3px solid #0f6e72;
  background: #f6f9f9;
  border-radius: 0 6px 6px 0;
  &.reply {
    border-left-color: #9aa5b1;
  }
}
.warn-box {
  font-size: 12px;
  color: #8a5a00;
  background: #fff8e6;
  border-radius: 8px;
  padding: 6px 10px;
}
</style>
