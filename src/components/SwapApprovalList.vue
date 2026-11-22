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
          <q-chip v-if="showWard" dense outline color="muted" icon="apartment" class="q-ma-none ward-chip">{{ wards.nameOf(s.wardId) }}</q-chip>
          <span class="text-caption text-muted ellipsis">{{ formatDateTime(s.createdAt) }}</span>
          <q-space />
          <span
            v-if="s.emailStatus"
            class="row items-center no-wrap text-caption"
            :class="s.emailStatus === 'sent' ? 'text-positive' : 'text-negative'"
          >
            <q-icon :name="s.emailStatus === 'sent' ? 'mark_email_read' : 'mark_email_unread'" size="18px" class="q-mr-xs" />
            <span :class="{ 'gt-xs': s.emailStatus === 'sent' }">{{ s.emailStatus === 'sent' ? '已通知' : '通知信寄送失敗' }}</span>
          </span>
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

    <div v-if="!items.length" class="empty-state">
      <q-icon name="inbox" size="40px" class="text-subtle" />
      <div class="empty-title q-mt-sm">{{ emptyText }}</div>
      <slot name="empty-action" />
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
import { useSwapsStore } from '@/stores/swaps';
import { useWardsStore } from '@/stores/wards';
import type { SwapRequest } from '@/types/schedule';
import { formatDateTime, formatMDW } from '@/utils/dates';
import { checkSwap } from '@/utils/scheduleHelpers';

const props = withDefaults(defineProps<{ items: SwapRequest[]; highlightId?: string | null; emptyText?: string }>(), {
  highlightId: null,
  emptyText: '沒有換班申請',
});

type ActionKey = 'approve' | 'reject' | 'cancel' | 'decide-approve' | 'decide-reject';

const auth = useAuthStore();
const schedules = useSchedulesStore();
const wards = useWardsStore();
const swaps = useSwapsStore();
/** Label each request with its ward when the user deals with several wards. */
const showWard = computed(() => wards.mine.length > 1);
const busyId = ref<string | null>(null);

const pending = (s: SwapRequest) => s.status === 'pending_target' || s.status === 'pending_head';

/** Live rule check of every pending swap against the current schedule (memoised per render). */
const checks = computed(() => {
  const map = new Map<string, ReturnType<typeof checkSwap>>();
  for (const s of props.items) {
    if (!pending(s)) continue;
    const schedule = schedules.list.find((x) => x.id === s.scheduleId);
    if (schedule) map.set(s.id, checkSwap(schedule, s, wards.rulesFor(schedule.wardId), schedules.previousOf(schedule)));
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
  } else if (wards.canManage(s.wardId)) {
    out.push({ key: 'decide-reject', label: '駁回', icon: 'close', color: 'negative', primary: false });
    out.push({ key: 'decide-approve', label: '核准', icon: 'verified', color: 'primary', primary: true });
  }
  if (s.requesterId === auth.email) out.unshift({ key: 'cancel', label: '撤回', icon: 'undo', color: 'muted', primary: false });
  return out;
}

/** Rejecting asks for an optional reply; the button is named for the action, never 「確定」. */
function askNote(title: string, ok: string): Promise<string | null> {
  return new Promise((resolve) => {
    Dialog.create({
      title,
      prompt: { model: '', type: 'text', outlined: true, dense: true, label: '回覆（選填）' },
      cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
      ok: { unelevated: true, noCaps: true, label: ok, color: 'negative' },
    })
      .onOk((v: string) => resolve(v ?? ''))
      .onCancel(() => resolve(null));
  });
}

async function run(s: SwapRequest, key: ActionKey): Promise<void> {
  let note = '';
  if (key === 'reject' || key === 'decide-reject') {
    const v = key === 'reject' ? await askNote('拒絕換班', '拒絕') : await askNote('駁回換班', '駁回');
    if (v === null) return;
    note = v;
  }
  if (key === 'decide-approve' && warningsFor(s).length) {
    const ok = await new Promise<boolean>((resolve) =>
      Dialog.create({
        title: '核准換班',
        message: `換班後有 ${warningsFor(s).length} 項規則問題，仍要核准？`,
        cancel: { flat: true, noCaps: true, label: '取消', color: 'muted' },
        ok: { unelevated: true, noCaps: true, label: '仍要核准', color: 'primary' },
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
  border-radius: var(--radius);
  &.highlight {
    box-shadow: 0 0 0 2px var(--focus);
  }
  @media (prefers-reduced-motion: no-preference) {
    transition: box-shadow 0.3s;
  }
}
.ward-chip {
  max-width: 12rem;
  flex-shrink: 1;
  min-width: 0;
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
    font-size: 0.75rem;
    color: var(--text-3);
    margin-left: 6px;
  }
}
.quote {
  font-size: 0.8125rem;
  color: var(--text-2);
  padding: 6px 10px;
  border-left: 3px solid var(--focus);
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
  &.reply {
    border-left-color: var(--line-strong);
  }
}
.warn-box {
  font-size: 0.75rem;
  color: var(--on-warn);
  background: var(--warn-soft);
  border-radius: 8px;
  padding: 6px 10px;
}
</style>
