<template>
  <q-layout view="hHh Lpr lFf">
    <q-header class="app-header">
      <q-toolbar class="q-px-sm">
        <q-btn flat dense round icon="menu" aria-label="選單" @click="drawer = !drawer" />
        <q-toolbar-title class="row items-center no-wrap q-pl-sm">
          <q-icon name="medical_services" size="22px" class="q-mr-sm" />
          <span class="text-weight-bold">護理排班</span>
          <span class="header-ward gt-xs q-ml-sm">{{ settings.settings.wardName }}</span>
        </q-toolbar-title>

        <MailQueueIndicator class="q-mr-xs" />

        <q-btn flat round dense icon="swap_horiz" :to="{ name: 'swaps' }" aria-label="換班">
          <q-badge v-if="swaps.badge" floating color="negative">{{ swaps.badge }}</q-badge>
          <q-tooltip>待處理換班</q-tooltip>
        </q-btn>

        <q-btn flat no-caps dense class="q-ml-sm q-px-xs" aria-label="帳號">
          <q-avatar size="30px" color="teal-9" text-color="white">
            <img v-if="auth.user?.photoURL" :src="auth.user.photoURL" alt="" referrerpolicy="no-referrer" />
            <span v-else>{{ initial }}</span>
          </q-avatar>
          <span class="gt-sm q-ml-sm">{{ auth.displayName }}</span>
          <q-menu anchor="bottom right" self="top right">
            <q-card flat style="min-width: 240px">
              <q-card-section class="q-pb-sm">
                <div class="text-subtitle1 text-weight-bold">{{ auth.displayName }}</div>
                <div class="text-caption text-grey-7">{{ auth.email }}</div>
                <div class="row q-gutter-xs q-mt-sm">
                  <q-chip dense color="primary" text-color="white" icon="badge" class="q-ml-none">
                    {{ auth.role ? ROLE_LABELS[auth.role] : '' }}
                  </q-chip>
                  <q-chip v-if="auth.profile?.schedulable" dense outline color="primary">{{ auth.profile.level }}</q-chip>
                  <q-chip v-if="auth.profile?.employeeId" dense outline color="grey-8">{{ auth.profile.employeeId }}</q-chip>
                </div>
              </q-card-section>
              <q-separator />
              <q-card-actions align="right">
                <q-btn flat no-caps color="negative" icon="logout" label="登出" @click="logout" />
              </q-card-actions>
            </q-card>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered :width="216" :breakpoint="1023" class="app-drawer">
      <q-list padding class="q-px-sm">
        <q-item
          v-for="item in nav"
          :key="item.name"
          v-ripple
          clickable
          :to="{ name: item.name }"
          active-class="nav-active"
          class="rounded-borders q-mb-xs"
        >
          <q-item-section avatar style="min-width: 40px">
            <q-icon :name="item.icon" />
          </q-item-section>
          <q-item-section>{{ item.label }}</q-item-section>
          <q-item-section v-if="item.badge" side>
            <q-badge color="negative" rounded>{{ item.badge }}</q-badge>
          </q-item-section>
        </q-item>
      </q-list>
      <div class="absolute-bottom q-pa-md text-caption text-grey-6">
        <q-chip v-if="useEmulators" dense color="orange-2" text-color="orange-10" icon="science" class="q-ml-none">Emulator</q-chip>
        <q-chip v-if="mail.provider === 'mock'" dense color="grey-3" text-color="grey-8" icon="outgoing_mail" class="q-ml-none">
          {{ PROVIDER_LABELS.mock }}
        </q-chip>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MailQueueIndicator from '@/components/MailQueueIndicator.vue';
import { ROLE_LABELS } from '@/constants/labels';
import { PROVIDER_LABELS } from '@/services/emailService';
import { useEmulators } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore } from '@/stores/leaves';
import { useMailQueueStore } from '@/stores/mailQueue';
import { useSchedulesStore } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useSwapsStore } from '@/stores/swaps';
import { useUsersStore } from '@/stores/users';

const router = useRouter();
const auth = useAuthStore();
const users = useUsersStore();
const settings = useSettingsStore();
const schedules = useSchedulesStore();
const swaps = useSwapsStore();
const leaves = useLeavesStore();
const mail = useMailQueueStore();

const drawer = ref(false);
const initial = computed(() => (auth.displayName || '?').slice(0, 1));

const nav = computed(() => {
  const items: { name: string; label: string; icon: string; badge?: number }[] = [
    { name: 'schedule', label: '班表', icon: 'calendar_month' },
    { name: 'swaps', label: '換班', icon: 'swap_horiz', badge: swaps.badge },
    { name: 'leave', label: '請假', icon: 'event_busy', badge: auth.isManager ? leaves.pending.length : 0 },
  ];
  if (auth.isManager) items.push({ name: 'emails', label: '郵件紀錄', icon: 'outgoing_mail' });
  if (auth.isDeveloper) {
    items.push({ name: 'staff', label: '人員管理', icon: 'groups' });
    items.push({ name: 'settings', label: '系統設定', icon: 'tune' });
  }
  return items;
});

function startSync(): void {
  users.start();
  settings.start();
  schedules.start(auth.isManager);
  swaps.start(auth.email, auth.isManager);
  leaves.start(auth.email, auth.isManager);
}

function stopSync(): void {
  users.stop();
  settings.stop();
  schedules.stop();
  swaps.stop();
  leaves.stop();
}

onMounted(startSync);
onBeforeUnmount(stopSync);

// Role changed by a developer while signed in → re-subscribe with the new scope.
watch(() => auth.isManager, () => {
  stopSync();
  startSync();
});

// Signed out, deactivated or removed → back to the login page.
watch(
  () => auth.status,
  (status) => {
    if (status !== 'ready' && status !== 'loading') void router.replace({ name: 'login' });
  },
);

async function logout(): Promise<void> {
  stopSync();
  await auth.logout();
}
</script>

<style scoped lang="scss">
.app-header {
  background: linear-gradient(90deg, #0b5f63, #0f6e72 60%, #13807f);
}
.header-ward {
  font-size: 13px;
  opacity: 0.85;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}
.app-drawer :deep(.q-item) {
  min-height: 42px;
}
</style>
