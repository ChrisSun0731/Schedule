<template>
  <q-page class="page page--narrow">
    <PageHeader title="更多" description="帳號、使用說明，以及你可以使用的管理功能。" />

    <section class="group" aria-labelledby="more-account">
      <h2 id="more-account" class="group-title">帳號</h2>
      <div class="surface account">
        <q-avatar size="44px" color="tint" text-color="on-tint">
          <img v-if="auth.user?.photoURL" :src="auth.user.photoURL" alt="" referrerpolicy="no-referrer" />
          <span v-else>{{ (auth.displayName || '?').slice(0, 1) }}</span>
        </q-avatar>
        <div class="account-text">
          <div class="text-weight-bold ellipsis">{{ auth.displayName }}</div>
          <div class="text-caption text-muted ellipsis">{{ auth.email }}</div>
          <div class="text-caption text-muted">{{ accountLine }}</div>
        </div>
        <q-btn flat no-caps color="negative" label="登出" @click="signOut" />
      </div>
    </section>

    <section v-if="nav.manage.length" class="group" aria-labelledby="more-manage">
      <h2 id="more-manage" class="group-title">管理</h2>
      <q-list class="surface list" separator>
        <q-item v-for="item in nav.manage" :key="item.name" clickable :to="{ name: item.name }" class="list-item">
          <q-item-section avatar><q-icon :name="item.icon" class="text-muted" /></q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ item.label }}</q-item-label>
            <q-item-label caption class="text-muted">{{ summaryFor(GUIDES[item.name], auth.role) }}</q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" class="text-subtle" /></q-item-section>
        </q-item>
      </q-list>
    </section>

    <section class="group" aria-labelledby="more-help">
      <h2 id="more-help" class="group-title">說明與工具</h2>
      <q-list class="surface list" separator>
        <q-item clickable :to="{ name: 'help' }" class="list-item">
          <q-item-section avatar><q-icon name="help_outline" class="text-muted" /></q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">使用說明</q-item-label>
            <q-item-label caption class="text-muted">依你的角色說明每個功能、班別代碼與規則檢查。</q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" class="text-subtle" /></q-item-section>
        </q-item>
        <q-item v-if="calendarScheduleId" clickable :to="{ name: 'calendar', query: { schedule: calendarScheduleId } }" class="list-item">
          <q-item-section avatar><q-icon name="event_available" class="text-muted" /></q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">加入行事曆</q-item-label>
            <q-item-label caption class="text-muted">{{ summaryFor(GUIDES.calendar, auth.role) }}</q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" class="text-subtle" /></q-item-section>
        </q-item>
      </q-list>
    </section>

    <p v-if="useEmulators || mail.provider === 'mock'" class="hint q-mt-lg">
      <template v-if="useEmulators">目前為測試環境（Emulator）。</template>
      <template v-if="mail.provider === 'mock'">郵件為{{ PROVIDER_LABELS.mock }}，不會真的寄出。</template>
    </p>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import { useSignOut } from '@/composables/useSignOut';
import { GUIDES, navForRole, summaryFor } from '@/constants/guide';
import { ROLE_LABELS } from '@/constants/labels';
import { PROVIDER_LABELS } from '@/services/emailService';
import { useEmulators } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useMailQueueStore } from '@/stores/mailQueue';
import { useSchedulesStore } from '@/stores/schedules';

const auth = useAuthStore();
const mail = useMailQueueStore();
const schedules = useSchedulesStore();
const signOut = useSignOut();

const nav = computed(() => navForRole(auth.role));
const accountLine = computed(() =>
  [auth.role ? ROLE_LABELS[auth.role] : '', auth.profile?.schedulable ? auth.profile.level : '', auth.profile?.employeeId ?? '']
    .filter(Boolean)
    .join(' · '),
);

/** Offer the calendar only when the selected period is published and includes me. */
const calendarScheduleId = computed(() => {
  const s = schedules.current;
  return s && s.status === 'published' && s.nurses[auth.email] ? s.id : null;
});
</script>

<style scoped lang="scss">
.group + .group {
  margin-top: 24px;
}
.group-title {
  margin: 0 0 8px 4px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: normal;
  color: var(--text-2);
}
.account {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px 12px 16px;
}
.account-text {
  flex: 1 1 auto;
  min-width: 0;
}
.list {
  overflow: hidden;
}
.list-item {
  min-height: 60px;
  padding: 10px 12px 10px 16px;
}
</style>
