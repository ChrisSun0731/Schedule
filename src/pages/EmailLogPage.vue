<template>
  <q-page class="page page--wide">
    <PageHeader title="郵件紀錄" guide="emails">
      <template #actions>
        <q-btn-toggle
          v-model="statusFilter"
          dense
          no-caps
          unelevated
          toggle-color="primary"
          color="soft"
          text-color="ink"
          aria-label="依狀態篩選"
          :options="[
            { label: '全部', value: 'all' },
            { label: '已送出', value: 'sent' },
            { label: '失敗', value: 'failed' },
          ]"
        />
      </template>
    </PageHeader>
    <p class="hint q-mb-sm">寄送方式：{{ PROVIDER_LABELS[mail.provider] }}<template v-if="mail.provider === 'mock'">（不會真的寄出，只記錄在這裡）</template>。顯示最近 500 封。</p>

    <q-table
      flat
      bordered
      dense
      :grid="$q.screen.lt.md"
      :rows="filtered"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 25, sortBy: 'createdAt', descending: true }"
      :rows-per-page-options="[25, 50, 100]"
      rows-per-page-label="每頁"
      :no-data-label="statusFilter === 'failed' ? '沒有寄送失敗的郵件' : '尚無郵件紀錄。發布班表或申請換班後，寄出的郵件會列在這裡。'"
      class="log-table"
    >
      <!-- Below 1024px: one card per e-mail. -->
      <template #item="props">
        <div class="col-12 col-sm-6 q-pa-xs">
          <article class="surface log-card full-height">
            <div class="row items-center no-wrap q-gutter-x-sm">
              <span class="tag">{{ EMAIL_TYPE_LABELS[props.row.type as EmailType] }}</span>
              <span class="row items-center no-wrap text-caption" :class="statusClass(props.row.status)">
                <q-icon :name="DELIVERY_STATUS_META[props.row.status as DeliveryStatus].icon" size="16px" class="q-mr-xs" />
                {{ DELIVERY_STATUS_META[props.row.status as DeliveryStatus].label }}
                <template v-if="props.row.attempts > 1">（{{ props.row.attempts }} 次）</template>
              </span>
              <q-space />
              <span class="text-caption text-muted tabular">{{ formatDateTime(props.row.createdAt) }}</span>
            </div>
            <div class="text-weight-medium q-mt-sm ellipsis">{{ props.row.toName }} <span class="text-caption text-muted">{{ props.row.to }}</span></div>
            <div class="text-body2 text-muted ellipsis-2-lines">{{ props.row.subject }}</div>
            <div v-if="props.row.error" class="text-caption text-negative q-mt-xs">{{ props.row.error }}</div>
          </article>
        </div>
      </template>
      <template #body-cell-type="props">
        <q-td :props="props"><span class="tag">{{ EMAIL_TYPE_LABELS[props.row.type as EmailType] }}</span></q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <span class="row items-center no-wrap" :class="statusClass(props.row.status)">
            <q-icon :name="DELIVERY_STATUS_META[props.row.status as DeliveryStatus].icon" size="16px" class="q-mr-xs" />
            {{ DELIVERY_STATUS_META[props.row.status as DeliveryStatus].label }}
          </span>
        </q-td>
      </template>
      <template #body-cell-to="props">
        <q-td :props="props">
          <div class="text-weight-medium">{{ props.row.toName }}</div>
          <div class="text-caption text-muted">{{ props.value }}</div>
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
import PageHeader from '@/components/PageHeader.vue';
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

/** Status as coloured text with an icon (never colour alone). */
function statusClass(status: DeliveryStatus): string {
  if (status === 'sent') return 'text-positive';
  if (status === 'failed') return 'text-negative';
  return 'text-muted';
}

const filtered = computed(() => (statusFilter.value === 'all' ? logs.value : logs.value.filter((l) => l.status === statusFilter.value)));

const columns: QTableColumn<EmailLog>[] = [
  { name: 'createdAt', label: '時間', field: 'createdAt', format: (v: number) => formatDateTime(v), sortable: true, align: 'left' },
  { name: 'type', label: '類型', field: 'type', align: 'left', format: (v: EmailType) => EMAIL_TYPE_LABELS[v] },
  { name: 'to', label: '收件人', field: 'to', align: 'left', sortable: true },
  { name: 'subject', label: '主旨', field: 'subject', align: 'left', classes: 'ellipsis', style: 'max-width: 280px' },
  { name: 'status', label: '狀態', field: 'status', align: 'left', sortable: true, format: (v: DeliveryStatus) => DELIVERY_STATUS_META[v].label },
  { name: 'attempts', label: '嘗試次數', field: 'attempts', align: 'center' },
  { name: 'error', label: '錯誤', field: 'error', align: 'left' },
  { name: 'sentBy', label: '寄件者', field: 'sentBy', align: 'left' },
];
</script>

<style scoped lang="scss">
.log-table {
  border-radius: var(--radius);
}
.log-card {
  padding: 12px 14px;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}
</style>
