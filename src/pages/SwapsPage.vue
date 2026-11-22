<template>
  <q-page class="page page--narrow">
    <PageHeader title="換班" guide="swaps">
      <template #actions>
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
        />
        <q-select
          v-if="swappable.length > 1"
          v-model="scheduleId"
          dense
          outlined
          emit-value
          map-options
          options-dense
          aria-label="要換班的排班週期"
          :options="swappable.map((s) => ({ value: s.id, label: periodLabel(s) }))"
          class="bg-surface period"
        />
        <q-btn unelevated no-caps color="primary" label="申請換班" :disable="!selectedSchedule" @click="dialog = true" />
      </template>
    </PageHeader>
    <p v-if="!selectedSchedule" class="hint q-mb-md">目前沒有可換班的班表。護理長發布班表後，就能申請換班。</p>

    <div class="surface tabs-card">
      <q-tabs v-model="tab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="text-muted" outside-arrows mobile-arrows>
        <q-tab name="incoming" label="待我回覆">
          <q-badge v-if="incoming.length" color="negative" floating>{{ incoming.length }}</q-badge>
        </q-tab>
        <q-tab name="outgoing" label="我的申請" />
        <q-tab v-if="auth.isManager" name="review" label="護理長審核">
          <q-badge v-if="review.length" color="negative" floating>{{ review.length }}</q-badge>
        </q-tab>
        <q-tab name="all" label="全部紀錄" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" :animated="!reducedMotion" class="bg-transparent">
        <q-tab-panel name="incoming">
          <p class="hint q-mb-md">同事想和你交換的班。同意後若符合規則，班表立即更新；否則轉給護理長審核。</p>
          <SwapApprovalList :items="incoming" :highlight-id="highlightId" empty-text="沒有等你回覆的換班" />
        </q-tab-panel>
        <q-tab-panel name="outgoing">
          <p class="hint q-mb-md">你送出的換班申請。對方回覆前可以撤回。</p>
          <SwapApprovalList :items="outgoing" :highlight-id="highlightId" empty-text="還沒有申請過換班">
            <template #empty-action>
              <q-btn v-if="selectedSchedule" unelevated no-caps color="primary" label="申請換班" class="q-mt-md" @click="dialog = true" />
            </template>
          </SwapApprovalList>
        </q-tab-panel>
        <q-tab-panel v-if="auth.isManager" name="review">
          <p class="hint q-mb-md">等待你核准的換班：違反規則，或病房設定換班需護理長核准。核准後班表立即更新，並通知雙方。</p>
          <SwapApprovalList :items="review" :highlight-id="highlightId" empty-text="沒有待審核的換班" />
        </q-tab-panel>
        <q-tab-panel name="all">
          <p class="hint q-mb-md">所有換班紀錄，包括已核准、已拒絕與已取消的申請。</p>
          <SwapApprovalList :items="all" :highlight-id="highlightId" empty-text="尚無換班紀錄" />
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <SwapRequestDialog v-if="selectedSchedule" v-model="dialog" :schedule="selectedSchedule" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
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
.ward-filter {
  min-width: 150px;
  @media (max-width: 599px) {
    flex: 1 1 40%;
  }
}
.period {
  min-width: 220px;
  @media (max-width: 599px) {
    flex: 1 1 100%;
  }
}
.tabs-card {
  overflow: hidden;
  :deep(.q-tab) {
    min-height: 44px;
  }
}
@media (max-width: 599px) {
  .tabs-card :deep(.q-tab-panel) {
    padding: 12px;
  }
}
</style>
