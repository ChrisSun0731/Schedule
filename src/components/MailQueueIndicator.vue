<template>
  <q-btn v-if="mail.stats.total" flat round dense :color="mail.stats.failed ? 'amber-4' : 'white'">
    <q-circular-progress
      v-if="mail.stats.pending"
      :value="mail.stats.progress * 100"
      size="24px"
      :thickness="0.22"
      color="white"
      track-color="teal-9"
      show-value
      font-size="9px"
    >
      {{ mail.stats.sent + mail.stats.failed }}
    </q-circular-progress>
    <q-icon v-else :name="mail.stats.failed ? 'mark_email_unread' : 'mark_email_read'" />
    <q-badge v-if="mail.stats.failed" floating color="negative">{{ mail.stats.failed }}</q-badge>
    <q-tooltip>郵件寄送 {{ mail.stats.sent }}/{{ mail.stats.total }}</q-tooltip>

    <q-menu anchor="bottom right" self="top right" style="width: 340px; max-width: 92vw">
      <div class="row items-center q-px-md q-pt-sm q-pb-xs">
        <div class="text-subtitle2">郵件寄送</div>
        <q-space />
        <q-chip dense outline color="primary" class="q-mr-none">{{ PROVIDER_LABELS[mail.provider] }}</q-chip>
      </div>
      <q-linear-progress :value="mail.stats.progress" :color="mail.stats.failed ? 'warning' : 'positive'" class="q-mx-md" rounded />
      <div class="text-caption text-grey-7 q-px-md q-pt-xs tabular">
        已送出 {{ mail.stats.sent }} · 失敗 {{ mail.stats.failed }} · 處理中 {{ mail.stats.pending }}
      </div>
      <div style="max-height: 50vh; overflow: auto">
        <DeliveryList :jobs="[...mail.jobs].reverse()" @retry="mail.retry" />
      </div>
      <div class="row q-pa-sm q-gutter-sm justify-end">
        <q-btn v-if="mail.stats.failed" flat dense no-caps color="primary" icon="refresh" label="重試失敗" @click="mail.retryFailed()" />
        <q-btn flat dense no-caps color="grey-8" icon="clear_all" label="清除已完成" :disable="!!mail.stats.pending && mail.stats.pending === mail.stats.total" @click="mail.clearFinished()" />
      </div>
    </q-menu>
  </q-btn>
</template>

<script setup lang="ts">
import DeliveryList from '@/components/DeliveryList.vue';
import { PROVIDER_LABELS } from '@/services/emailService';
import { useMailQueueStore } from '@/stores/mailQueue';

const mail = useMailQueueStore();
</script>
