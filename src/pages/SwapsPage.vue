<template>
  <q-page class="page-pad">
    <div class="page-head q-mb-md">
      <h1 class="page-title q-my-none">換班</h1>
      <q-space />
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
      >
        <template #prepend><q-icon name="apartment" /></template>
      </q-select>
      <q-select
        v-if="swappable.length > 1"
        v-model="scheduleId"
        dense
        outlined
        emit-value
        map-options
        options-dense
        aria-label="排班週期"
        :options="swappable.map((s) => ({ value: s.id, label: periodLabel(s) }))"
        class="bg-surface period"
      />
      <q-btn unelevated no-caps color="primary" icon="add" label="申請換班" :disable="!selectedSchedule" @click="dialog = true" />
      <div v-if="!selectedSchedule" class="text-caption text-muted full-width text-right">目前沒有可換班的已發布班表</div>
    </div>

    <q-card flat bordered class="tabs-card">
      <q-tabs v-model="tab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="text-muted" outside-arrows mobile-arrows>
        <q-tab name="incoming" icon="inbox" label="待我回覆">
          <q-badge v-if="incoming.length" color="negative" floating>{{ incoming.length }}</q-badge>
        </q-tab>
        <q-tab name="outgoing" icon="outbox" label="我的申請" />
        <q-tab v-if="auth.isManager" name="review" icon="supervisor_account" label="護理長審核">
          <q-badge v-if="review.length" color="negative" floating>{{ review.length }}</q-badge>
        </q-tab>
        <q-tab name="all" icon="history" label="全部紀錄" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" :animated="!reducedMotion" class="bg-transparent">
        <q-tab-panel name="incoming">
          <SwapApprovalList :items="incoming" :highlight-id="highlightId" empty-text="沒有等你回覆的換班" />
        </q-tab-panel>
        <q-tab-panel name="outgoing">
          <SwapApprovalList :items="outgoing" :highlight-id="highlightId" empty-text="還沒有申請過換班">
            <template #empty-action>
              <q-btn v-if="selectedSchedule" unelevated no-caps color="primary" icon="add" label="申請換班" class="q-mt-md" @click="dialog = true" />
            </template>
          </SwapApprovalList>
        </q-tab-panel>
        <q-tab-panel v-if="auth.isManager" name="review">
          <SwapApprovalList :items="review" :highlight-id="highlightId" empty-text="沒有待審核的換班" />
        </q-tab-panel>
        <q-tab-panel name="all">
          <SwapApprovalList :items="all" :highlight-id="highlightId" empty-text="尚無換班紀錄" />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <SwapRequestDialog v-if="selectedSchedule" v-model="dialog" :schedule="selectedSchedule" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import SwapApprovalList from '@/components/SwapApprovalList.vue';
import SwapRequestDialog from '@/components/SwapRequestDialog.vue';
import { scrollBehavior, useReducedMotion } from '@/composables/useMotion';
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { useSwapsStore } from '@/stores/swaps';
import { useWardsStore } from '@/stores/wards';
import type { Schedule, SwapRequest } from '@/types/schedule';
import { formatPeriod, todayISO } from '@/utils/dates';

const route = useRoute();
const auth = useAuthStore();
const schedules = useSchedulesStore();
const swaps = useSwapsStore();
const wards = useWardsStore();
const reducedMotion = useReducedMotion();

/** null = every ward the user works in. */
const wardFilter = ref<string | null>(null);
const wardOptions = computed(() => [{ value: null, label: '全部病房' }, ...wards.mine.map((w) => ({ value: w.id, label: w.name }))]);
const inWard = (items: SwapRequest[]) => (wardFilter.value ? items.filter((s) => s.wardId === wardFilter.value) : items);
const incoming = computed(() => inWard(swaps.incoming));
const outgoing = computed(() => inWard(swaps.outgoing));
const review = computed(() => inWard(swaps.review));
const all = computed(() => inWard(swaps.list));

function periodLabel(s: Schedule): string {
  const period = formatPeriod(s.startDate, s.endDate);
  return wards.mine.length > 1 ? `${wards.nameOf(s.wardId)} · ${period}` : period;
}

const tab = ref<'incoming' | 'outgoing' | 'review' | 'all'>(swaps.incoming.length || !auth.isManager ? 'incoming' : 'review');
const dialog = ref(false);
const highlightId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));

/** Published schedules that are not over yet and include me (head nurses: those of their wards). */
const swappable = computed(() =>
  schedules.list
    .filter((s) => s.status === 'published' && s.endDate >= todayISO() && (wards.canManage(s.wardId) || !!s.nurses[auth.email]))
    .filter((s) => !wardFilter.value || s.wardId === wardFilter.value)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || wards.nameOf(a.wardId).localeCompare(wards.nameOf(b.wardId))),
);
const scheduleId = ref<string | null>(null);
const selectedSchedule = computed(
  () => swappable.value.find((s) => s.id === scheduleId.value) ?? swappable.value.find((s) => s.id === schedules.selectedId) ?? swappable.value[0] ?? null,
);
watch(selectedSchedule, (s) => (scheduleId.value = s?.id ?? null), { immediate: true });

// Deep link from e-mail (#/swaps?id=…): open the tab that contains it and scroll to it.
watch(
  [highlightId, () => swaps.list.length],
  async ([id]) => {
    if (!id) return;
    const s = swaps.list.find((x) => x.id === id);
    if (!s) return;
    if (wardFilter.value && wardFilter.value !== s.wardId) wardFilter.value = null;
    if (swaps.incoming.some((x) => x.id === id)) tab.value = 'incoming';
    else if (auth.isManager && swaps.review.some((x) => x.id === id)) tab.value = 'review';
    else if (s.requesterId === auth.email) tab.value = 'outgoing';
    else tab.value = 'all';
    await nextTick();
    setTimeout(() => document.querySelector(`[data-swap="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }), 350);
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ward-filter {
  min-width: 170px;
  @media (max-width: 599px) {
    flex: 1 1 100%;
    order: 3;
  }
}
.period {
  min-width: 230px;
  @media (max-width: 599px) {
    flex: 1 1 100%;
    order: 3;
  }
}
.tabs-card {
  border-radius: 12px;
  max-width: 860px;
}
@media (max-width: 599px) {
  .tabs-card :deep(.q-tab-panel) {
    padding: 12px 8px;
  }
}
</style>
