<template>
  <q-btn v-if="mail.stats.total" flat round dense :class="{ 'text-amber-4': mail.stats.failed }" :aria-label="summary">
    <!-- The ring shows progress; the counts are in the accessible name, the tooltip and the menu (no 9px digits). -->
    <q-circular-progress
      v-if="mail.stats.pending"
      :value="mail.stats.progress * 100"
      size="24px"
      :thickness="0.22"
      color="white"
      track-color="teal-9"
      aria-hidden="true"
    />
    <q-icon v-else :name="mail.stats.failed ? 'mark_email_unread' : 'mark_email_read'" />
    <q-badge v-if="mail.stats.failed" floating color="negative" aria-hidden="true">{{ mail.stats.failed }}</q-badge>
    <q-tooltip>{{ summary }}</q-tooltip>

    <q-menu anchor="bottom right" self="top right" style="width: 340px; max-width: 92vw">
      <div class="row items-center q-px-md q-pt-sm q-pb-xs">
        <div class="text-subtitle2">郵件寄送</div>
        <q-space />
        <q-chip dense outline color="primary" class="q-mr-none">{{ PROVIDER_LABELS[mail.provider] }}</q-chip>
      </div>
      <q-linear-progress :value="mail.stats.progress" :color="mail.stats.failed ? 'warning' : 'positive'" class="q-mx-md" rounded aria-hidden="true" />
      <div class="text-caption text-muted q-px-md q-pt-xs tabular" aria-live="polite">
        已送出 {{ mail.stats.sent }} · 失敗 {{ mail.stats.failed }} · 處理中 {{ mail.stats.pending }}
      </div>
      <div style="max-height: 50vh; overflow: auto">
        <DeliveryList :jobs="[...mail.jobs].reverse()" @retry="mail.retry" />
      </div>
      <div class="row q-pa-sm q-gutter-sm justify-end">
        <q-btn v-if="mail.stats.failed" flat dense no-caps color="primary" icon="refresh" label="重試失敗" @click="mail.retryFailed()" />
        <q-btn
          flat
          dense
          no-caps
          color="muted"
          icon="clear_all"
          label="清除已完成"
          :disable="!!mail.stats.pending && mail.stats.pending === mail.stats.total"
          @click="mail.clearFinished()"
        />
      </div>
    </q-menu>
  </q-btn>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DeliveryList from '@/components/DeliveryList.vue';
import { PROVIDER_LABELS } from '@/services/emailService';
import { useMailQueueStore } from '@/stores/mailQueue';

const mail = useMailQueueStore();

const summary = computed(() => {
  const s = mail.stats;
  const parts = [`郵件寄送 ${s.sent + s.failed}/${s.total}`];
  if (s.failed) parts.push(`${s.failed} 封失敗`);
  if (s.pending) parts.push(`${s.pending} 封處理中`);
  return parts.join('，');
});
</script>
