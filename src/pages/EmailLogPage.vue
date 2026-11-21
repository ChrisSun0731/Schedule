<template>
  <q-page class="page-pad">
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-icon name="outgoing_mail" size="26px" color="primary" />
      <div class="page-title">郵件紀錄</div>
      <q-chip dense outline color="primary">{{ PROVIDER_LABELS[mail.provider] }}</q-chip>
      <q-space />
      <q-btn-toggle
        v-model="statusFilter"
        dense
        no-caps
        unelevated
        toggle-color="primary"
        color="grey-2"
        text-color="grey-8"
        :options="[
          { label: '全部', value: 'all' },
          { label: '已送出', value: 'sent' },
          { label: '失敗', value: 'failed' },
        ]"
      />
    </div>

    <q-table
      flat
      bordered
      dense
      :rows="filtered"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 25, sortBy: 'createdAt', descending: true }"
      :rows-per-page-options="[25, 50, 100]"
      rows-per-page-label="每頁"
      no-data-label="沒有紀錄"
      class="log-table"
    >
      <template #body-cell-type="props">
        <q-td :props="props"><q-chip dense outline color="primary" class="q-ma-none">{{ EMAIL_TYPE_LABELS[props.value as EmailType] }}</q-chip></q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip dense :color="DELIVERY_STATUS_META[props.value as DeliveryStatus].color" text-color="white" :icon="DELIVERY_STATUS_META[props.value as DeliveryStatus].icon" class="q-ma-none">
            {{ DELIVERY_STATUS_META[props.value as DeliveryStatus].label }}
          </q-chip>
        </q-td>
      </template>
      <template #body-cell-to="props">
        <q-td :props="props">
          <div class="text-weight-medium">{{ props.row.toName }}</div>
          <div class="text-caption text-grey-7">{{ props.value }}</div>
        </q-td>
      </template>
      <template #body-cell-error="props">
        <q-td :props="props" class="text-negative ellipsis" style="max-width: 220px">
          {{ props.value || '' }}
          <q-tooltip v-if="props.value">{{ props.value }}</q-tooltip>
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import type { QTableColumn } from 'quasar';
import { DELIVERY_STATUS_META, EMAIL_TYPE_LABELS } from '@/constants/labels';
import { PROVIDER_LABELS } from '@/services/emailService';
import { db } from '@/services/firebase';
import { useMailQueueStore } from '@/stores/mailQueue';
import type { DeliveryStatus, EmailLog, EmailType } from '@/types/schedule';
import { formatDateTime } from '@/utils/dates';

const mail = useMailQueueStore();
const logs = ref<EmailLog[]>([]);
const loading = ref(true);
const statusFilter = ref<'all' | 'sent' | 'failed'>('all');
let unsub: Unsubscribe | null = null;

onMounted(() => {
  unsub = onSnapshot(query(collection(db(), 'email_logs'), orderBy('createdAt', 'desc'), limit(500)), (snap) => {
    logs.value = snap.docs.map((d) => ({ ...(d.data() as EmailLog), id: d.id }));
    loading.value = false;
  });
});
onBeforeUnmount(() => unsub?.());

const filtered = computed(() => (statusFilter.value === 'all' ? logs.value : logs.value.filter((l) => l.status === statusFilter.value)));

const columns: QTableColumn<EmailLog>[] = [
  { name: 'createdAt', label: '時間', field: 'createdAt', format: (v: number) => formatDateTime(v), sortable: true, align: 'left' },
  { name: 'type', label: '類型', field: 'type', align: 'left' },
  { name: 'to', label: '收件人', field: 'to', align: 'left', sortable: true },
  { name: 'subject', label: '主旨', field: 'subject', align: 'left', classes: 'ellipsis', style: 'max-width: 280px' },
  { name: 'status', label: '狀態', field: 'status', align: 'left', sortable: true },
  { name: 'attempts', label: '次數', field: 'attempts', align: 'center' },
  { name: 'error', label: '錯誤', field: 'error', align: 'left' },
  { name: 'sentBy', label: '寄件者', field: 'sentBy', align: 'left' },
];
</script>

<style scoped lang="scss">
.log-table {
  border-radius: 12px;
}
</style>
