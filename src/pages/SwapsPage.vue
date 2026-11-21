<template>
  <q-page class="page-pad">
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-icon name="swap_horiz" size="26px" color="primary" />
      <div class="page-title">換班</div>
      <q-space />
      <q-select
        v-if="swappable.length > 1"
        v-model="scheduleId"
        dense
        outlined
        emit-value
        map-options
        options-dense
        :options="swappable.map((s) => ({ value: s.id, label: formatPeriod(s.startDate, s.endDate) }))"
        class="bg-white"
        style="min-width: 230px"
      />
      <q-btn unelevated no-caps color="primary" icon="add" label="申請換班" :disable="!selectedSchedule" @click="dialog = true" />
    </div>

    <q-card flat bordered class="tabs-card">
      <q-tabs v-model="tab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="text-grey-8" outside-arrows mobile-arrows>
        <q-tab name="incoming" icon="inbox" label="待我回覆">
          <q-badge v-if="swaps.incoming.length" color="negative" floating>{{ swaps.incoming.length }}</q-badge>
        </q-tab>
        <q-tab name="outgoing" icon="outbox" label="我的申請" />
        <q-tab v-if="auth.isManager" name="review" icon="supervisor_account" label="護理長審核">
          <q-badge v-if="swaps.review.length" color="negative" floating>{{ swaps.review.length }}</q-badge>
        </q-tab>
        <q-tab name="all" icon="history" label="全部紀錄" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="tab" animated class="bg-transparent">
        <q-tab-panel name="incoming"><SwapApprovalList :items="swaps.incoming" :highlight-id="highlightId" /></q-tab-panel>
        <q-tab-panel name="outgoing"><SwapApprovalList :items="swaps.outgoing" :highlight-id="highlightId" /></q-tab-panel>
        <q-tab-panel v-if="auth.isManager" name="review"><SwapApprovalList :items="swaps.review" :highlight-id="highlightId" /></q-tab-panel>
        <q-tab-panel name="all"><SwapApprovalList :items="swaps.list" :highlight-id="highlightId" /></q-tab-panel>
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
import { useAuthStore } from '@/stores/auth';
import { useSchedulesStore } from '@/stores/schedules';
import { useSwapsStore } from '@/stores/swaps';
import { formatPeriod, todayISO } from '@/utils/dates';

const route = useRoute();
const auth = useAuthStore();
const schedules = useSchedulesStore();
const swaps = useSwapsStore();

const tab = ref<'incoming' | 'outgoing' | 'review' | 'all'>(swaps.incoming.length || !auth.isManager ? 'incoming' : 'review');
const dialog = ref(false);
const highlightId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));

/** Published schedules that are not over yet and include me (managers: all). */
const swappable = computed(() =>
  schedules.list
    .filter((s) => s.status === 'published' && s.endDate >= todayISO() && (auth.isManager || !!s.nurses[auth.email]))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)),
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
    if (swaps.incoming.some((x) => x.id === id)) tab.value = 'incoming';
    else if (auth.isManager && swaps.review.some((x) => x.id === id)) tab.value = 'review';
    else if (s.requesterId === auth.email) tab.value = 'outgoing';
    else tab.value = 'all';
    await nextTick();
    setTimeout(() => document.querySelector(`[data-swap="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.tabs-card {
  border-radius: 12px;
  background: #fff;
  max-width: 860px;
}
</style>
