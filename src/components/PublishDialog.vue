<template>
  <AppDialog
    :model-value="modelValue"
    :title="alreadyPublished ? '重新通知' : '發布並通知'"
    :meta="formatPeriod(schedule.startDate, schedule.endDate)"
    :description="
      alreadyPublished
        ? '再寄一次個人班表 Email 給這份班表的每位人員，例如在調整班表之後。'
        : '發布後，病房所有人都能在系統中看到這份班表，並可以申請換班。'
    "
    :width="520"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <!-- Confirm -->
    <template v-if="phase === 'confirm'">
      <p class="summary tabular">
        <q-icon name="groups" size="20px" class="text-muted" />
        {{ recipients.total }} 位人員 · {{ recipients.withEmail }} 位有 Email
      </p>
      <p v-if="!evaluation.errorCount" class="summary text-positive">
        <q-icon name="task_alt" size="20px" />
        符合所有排班規則
      </p>

      <q-banner v-if="evaluation.errorCount" dense rounded class="bg-error-soft text-negative q-mt-sm">
        <template #avatar><q-icon name="report" /></template>
        仍有 {{ evaluation.errorCount }} 項違規。建議先在「規則檢查」修正。
        <template #action>
          <q-checkbox v-model="force" dense color="negative" label="仍要發布" />
        </template>
      </q-banner>

      <q-item tag="label" class="q-px-none q-mt-sm">
        <q-item-section avatar><q-toggle v-model="notify" color="primary" /></q-item-section>
        <q-item-section>
          <q-item-label>寄送個人班表 Email</q-item-label>
          <q-item-label caption>每人收到自己 28 天的班，以及加入 Google 日曆的按鈕（{{ PROVIDER_LABELS[mail.provider] }}）</q-item-label>
        </q-item-section>
      </q-item>
      <q-item v-if="recipients.missing.length" class="q-px-none">
        <q-item-section avatar><q-icon name="warning" color="warning" class="q-ml-sm" /></q-item-section>
        <q-item-section class="text-caption text-muted">
          沒有 Email，不會收到通知：{{ recipients.missing.join('、') }}
        </q-item-section>
      </q-item>
    </template>

    <!-- Sending -->
    <template v-else>
      <div class="row items-center q-mb-xs tabular" aria-live="polite">
        <q-icon
          :name="mail.broadcastStats.pending ? 'outgoing_mail' : mail.broadcastStats.failed ? 'mark_email_unread' : 'mark_email_read'"
          :color="mail.broadcastStats.pending ? 'primary' : mail.broadcastStats.failed ? 'warning' : 'positive'"
          size="22px"
          class="q-mr-sm"
        />
        <span class="text-subtitle2">已處理 {{ mail.broadcastStats.sent + mail.broadcastStats.failed }} / {{ mail.broadcastStats.total }}</span>
        <q-space />
        <span class="text-caption text-positive q-mr-sm">已送出 {{ mail.broadcastStats.sent }}</span>
        <span v-if="mail.broadcastStats.failed" class="text-caption text-negative">失敗 {{ mail.broadcastStats.failed }}</span>
      </div>
      <q-linear-progress
        aria-label="寄送進度"
        :value="mail.broadcastStats.progress"
        :color="mail.broadcastStats.failed ? 'warning' : 'positive'"
        size="10px"
        rounded
        :stripe="mail.broadcastStats.pending > 0"
      />
      <p class="hint q-mt-sm">可以關閉此視窗，郵件會在背景繼續寄送；進度顯示在頁首的郵件圖示。</p>
      <div class="delivery-box q-mt-sm">
        <DeliveryList :jobs="mail.broadcast" @retry="mail.retry" />
      </div>
    </template>

    <template #actions>
      <template v-if="phase === 'confirm'">
        <q-btn v-close-popup flat no-caps color="muted" label="取消" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          :label="alreadyPublished ? '重新通知' : notify ? '發布並通知' : '發布'"
          :loading="busy"
          :disable="(!!evaluation.errorCount && !force && !alreadyPublished) || (alreadyPublished && !notify)"
          @click="submit"
        />
      </template>
      <template v-else>
        <q-btn v-if="mail.broadcastStats.failed" unelevated no-caps color="soft" text-color="ink" label="重試失敗" @click="mail.retryFailed()" />
        <q-btn v-close-popup unelevated no-caps color="primary" :label="mail.broadcastStats.pending ? '背景寄送' : '完成'" />
      </template>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Notify } from 'quasar';
import AppDialog from '@/components/AppDialog.vue';
import DeliveryList from '@/components/DeliveryList.vue';
import { PROVIDER_LABELS } from '@/services/emailService';
import { errorMessage } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useMailQueueStore } from '@/stores/mailQueue';
import { useSchedulesStore } from '@/stores/schedules';
import type { Schedule } from '@/types/schedule';
import { formatPeriod } from '@/utils/dates';
import type { EvaluationResult } from '@/utils/scheduler';

const props = defineProps<{ modelValue: boolean; schedule: Schedule; evaluation: EvaluationResult }>();
defineEmits<{ 'update:modelValue': [v: boolean] }>();

const auth = useAuthStore();
const schedules = useSchedulesStore();
const mail = useMailQueueStore();

const phase = ref<'confirm' | 'sending'>('confirm');
const notify = ref(true);
const force = ref(false);
const busy = ref(false);
const alreadyPublished = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      phase.value = 'confirm';
      force.value = false;
      notify.value = true;
      alreadyPublished.value = props.schedule.status === 'published';
    }
  },
  { immediate: true },
);

const recipients = computed(() => {
  const nurses = props.schedule.nurseOrder.map((id) => props.schedule.nurses[id]).filter((n) => !!n);
  return {
    total: nurses.length,
    withEmail: nurses.filter((n) => n.email).length,
    missing: nurses.filter((n) => !n.email).map((n) => n.name),
  };
});

async function submit(): Promise<void> {
  busy.value = true;
  try {
    if (!alreadyPublished.value) {
      await schedules.publish(props.schedule, auth.email);
      Notify.create({ type: 'positive', icon: 'publish', message: '班表已發布' });
    }
    if (notify.value) {
      mail.sendSchedule(props.schedule);
      phase.value = 'sending';
    }
  } catch (err) {
    Notify.create({ type: 'negative', message: errorMessage(err) });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  font-size: 0.9375rem;
  font-weight: 500;
}
.delivery-box {
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
</style>
