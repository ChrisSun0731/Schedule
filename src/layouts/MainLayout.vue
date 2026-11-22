<template>
  <q-layout view="hHh Lpr lFf">
    <q-header class="app-header">
      <q-toolbar class="q-px-sm">
        <!-- On phones the three main sections live in the bottom tabs; the drawer only holds managers' extra pages. -->
        <q-btn v-if="!compact || extraNav.length" flat dense round icon="menu" aria-label="選單" @click="drawer = !drawer" />
        <q-toolbar-title class="row items-center no-wrap q-pl-sm">
          <q-icon name="medical_services" size="22px" class="q-mr-sm" />
          <span class="text-weight-bold">護理排班</span>
          <span v-if="headerWard" class="header-ward gt-xs q-ml-sm">{{ headerWard }}</span>
        </q-toolbar-title>

        <MailQueueIndicator class="q-mr-xs" />

        <q-btn v-if="!compact" flat round dense icon="swap_horiz" :to="{ name: 'swaps' }" :aria-label="swaps.badge ? `換班，${swaps.badge} 件待處理` : '換班'">
          <q-badge v-if="swaps.badge" floating color="negative">{{ swaps.badge }}</q-badge>
          <q-tooltip>待處理換班</q-tooltip>
        </q-btn>

        <q-btn flat no-caps dense class="q-ml-sm q-px-xs" :aria-label="`帳號：${auth.displayName}`">
          <q-avatar size="30px" color="teal-9" text-color="white">
            <img v-if="auth.user?.photoURL" :src="auth.user.photoURL" alt="" referrerpolicy="no-referrer" />
            <span v-else>{{ initial }}</span>
          </q-avatar>
          <span class="gt-sm q-ml-sm">{{ auth.displayName }}</span>
          <q-menu anchor="bottom right" self="top right">
            <q-card flat style="min-width: 240px">
              <q-card-section class="q-pb-sm">
                <div class="text-subtitle1 text-weight-bold">{{ auth.displayName }}</div>
                <div class="text-caption text-muted">{{ auth.email }}</div>
                <div class="row q-gutter-xs q-mt-sm">
                  <q-chip dense color="primary" text-color="white" icon="badge" class="q-ml-none">
                    {{ auth.role ? ROLE_LABELS[auth.role] : '' }}
                  </q-chip>
                  <q-chip v-if="auth.profile?.schedulable" dense outline color="muted">{{ auth.profile.level }}</q-chip>
                  <q-chip v-if="auth.profile?.employeeId" dense outline color="muted">{{ auth.profile.employeeId }}</q-chip>
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
          v-for="item in compact ? extraNav : nav"
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
            <q-badge color="negative" rounded :aria-label="`${item.badge} 件待處理`">{{ item.badge }}</q-badge>
          </q-item-section>
        </q-item>
      </q-list>
      <div class="absolute-bottom q-pa-md text-caption">
        <q-chip v-if="useEmulators" dense color="warn-soft" text-color="on-warn" icon="science" class="q-ml-none">Emulator</q-chip>
        <q-chip v-if="mail.provider === 'mock'" dense color="soft" text-color="muted" icon="outgoing_mail" class="q-ml-none">
          {{ PROVIDER_LABELS.mock }}
        </q-chip>
      </div>
    </q-drawer>

    <q-footer v-if="compact" bordered class="app-footer">
      <q-tabs dense no-caps class="bottom-tabs" active-color="primary" indicator-color="transparent" align="justify" aria-label="主要區域">
        <q-route-tab v-for="item in primaryNav" :key="item.name" :to="{ name: item.name }" :icon="item.icon" :label="item.label">
          <q-badge v-if="item.badge" color="negative" floating :aria-label="`${item.badge} 件待處理`">{{ item.badge }}</q-badge>
        </q-route-tab>
      </q-tabs>
    </q-footer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import MailQueueIndicator from '@/components/MailQueueIndicator.vue';
import { ROLE_LABELS } from '@/constants/labels';
import { PROVIDER_LABELS } from '@/services/emailService';
import { useEmulators } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';
import { useLeavesStore, type LeaveScope } from '@/stores/leaves';
import { useMailQueueStore } from '@/stores/mailQueue';
import { useSchedulesStore, type ScheduleScope } from '@/stores/schedules';
import { useSettingsStore } from '@/stores/settings';
import { useSwapsStore } from '@/stores/swaps';
import { useUsersStore } from '@/stores/users';
import { useWardsStore } from '@/stores/wards';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();
const users = useUsersStore();
const settings = useSettingsStore();
const schedules = useSchedulesStore();
const swaps = useSwapsStore();
const leaves = useLeavesStore();
const wards = useWardsStore();
const mail = useMailQueueStore();

const drawer = ref(false);
const initial = computed(() => (auth.displayName || '?').slice(0, 1));
/** Single-ward staff see their ward here; multi-ward users switch wards on the schedule page. */
const headerWard = computed(() => (wards.mine.length === 1 ? wards.mine[0]!.name : ''));

/** Below 1024px: bottom tabs for the main sections, drawer for the rest. */
const compact = computed(() => $q.screen.lt.md);

interface NavItem {
  name: string;
  label: string;
  icon: string;
  badge?: number;
}

const primaryNav = computed<NavItem[]>(() => [
  { name: 'schedule', label: '班表', icon: 'calendar_month' },
  { name: 'swaps', label: '換班', icon: 'swap_horiz', badge: swaps.badge },
  { name: 'leave', label: '請假', icon: 'event_busy', badge: leaves.pending.length },
]);

const extraNav = computed<NavItem[]>(() => {
  const items: NavItem[] = [];
  if (auth.isManager) {
    items.push({ name: 'wards', label: '病房', icon: 'apartment' });
    items.push({ name: 'emails', label: '郵件紀錄', icon: 'outgoing_mail' });
  }
  if (auth.isDeveloper) {
    items.push({ name: 'staff', label: '人員管理', icon: 'groups' });
    items.push({ name: 'settings', label: '系統設定', icon: 'tune' });
  }
  return items;
});

const nav = computed(() => [...primaryNav.value, ...extraNav.value]);

/**
 * What to listen to. Developers see every ward. Head nurses see drafts and requests of the
 * wards they manage; everyone sees published schedules of their own wards and their own requests.
 */
function scopes(): { schedules: ScheduleScope; requests: LeaveScope } {
  if (auth.isDeveloper) return { schedules: { kind: 'all' }, requests: { kind: 'all' } };
  const own = auth.profile?.wardIds ?? [];
  const managed = auth.role === 'head_nurse' ? own : [];
  return { schedules: { kind: 'wards', managed, member: own }, requests: { kind: 'wards', managed } };
}

function startScoped(): void {
  const s = scopes();
  schedules.start(s.schedules);
  swaps.start(auth.email, s.requests);
  leaves.start(auth.email, s.requests);
}

function stopScoped(): void {
  schedules.stop();
  swaps.stop();
  leaves.stop();
}

function startSync(): void {
  users.start();
  settings.start();
  wards.start();
  startScoped();
}

function stopSync(): void {
  users.stop();
  settings.stop();
  wards.stop();
  stopScoped();
}

onMounted(startSync);
onBeforeUnmount(stopSync);

// Role or wards changed by a developer while signed in → re-subscribe with the new scope.
watch(
  () => `${auth.role}|${(auth.profile?.wardIds ?? []).join(',')}`,
  () => {
    stopScoped();
    startScoped();
  },
);

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
  background: var(--header-bg);
  color: var(--header-fg);
  border-bottom: 1px solid var(--line);
}
.header-ward {
  font-size: 0.8125rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--header-pill);
}
.app-drawer :deep(.q-item) {
  min-height: 44px;
}
.app-footer {
  background: var(--surface);
  color: var(--text-2);
  padding-bottom: env(safe-area-inset-bottom);
}
.bottom-tabs :deep(.q-tab) {
  min-height: 56px;
}
.bottom-tabs :deep(.q-tab__label) {
  font-size: 0.75rem;
}
</style>
