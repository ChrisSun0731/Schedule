<template>
  <q-list dense separator class="delivery-list">
    <q-item v-for="job in jobs" :key="job.id">
      <q-item-section avatar style="min-width: 34px">
        <q-icon
          :name="DELIVERY_STATUS_META[job.status].icon"
          :color="DELIVERY_STATUS_META[job.status].color"
          size="20px"
          :class="{ spin: job.status === 'sending' || job.status === 'retrying' }"
        />
      </q-item-section>
      <q-item-section>
        <q-item-label class="ellipsis">{{ job.message.toName }}</q-item-label>
        <q-item-label caption class="ellipsis text-muted">{{ job.message.to }}</q-item-label>
        <q-item-label v-if="job.error && job.status !== 'sent'" caption class="text-negative ellipsis">
          {{ job.error }}
        </q-item-label>
      </q-item-section>
      <q-item-section side class="row no-wrap items-center">
        <div class="row no-wrap items-center q-gutter-x-xs">
          <q-chip dense square :color="DELIVERY_STATUS_META[job.status].color" text-color="white" class="q-ma-none">
            {{ DELIVERY_STATUS_META[job.status].label }}
            <span v-if="job.attempts > 1" class="q-ml-xs">×{{ job.attempts }}</span>
          </q-chip>
          <q-btn
            v-if="job.status === 'failed'"
            flat
            dense
            round
            icon="refresh"
            color="primary"
            :aria-label="`重新寄送給 ${job.message.toName}`"
            @click="$emit('retry', job)"
          >
            <q-tooltip>重試</q-tooltip>
          </q-btn>
        </div>
      </q-item-section>
    </q-item>
    <q-item v-if="!jobs.length">
      <q-item-section class="text-muted text-center q-py-md">沒有寄送中的郵件</q-item-section>
    </q-item>
  </q-list>
</template>

<script setup lang="ts">
import { DELIVERY_STATUS_META } from '@/constants/labels';
import type { DispatchJob } from '@/services/emailService';

defineProps<{ jobs: DispatchJob[] }>();
defineEmits<{ retry: [job: DispatchJob] }>();
</script>

<style scoped lang="scss">
@media (prefers-reduced-motion: no-preference) {
  .spin {
    animation: spin 1.2s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
