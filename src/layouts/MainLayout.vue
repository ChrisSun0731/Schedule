<template>
  <q-layout view="hHh LpR lFf">
    <q-header class="app-header">
      <q-toolbar class="app-toolbar">
        <!-- Wide screens: the sidebar can be hidden to give the schedule grid more room. -->
        <q-btn
          v-if="!compact"
          flat
          dense
          round
          icon="menu"
          class="text-muted"
          :aria-label="drawer ? '隱藏側邊欄' : '顯示側邊欄'"
          :aria-expanded="drawer"
          @click="drawer = !drawer"
        />
        <router-link :to="{ name: 'schedule' }" class="brand" aria-label="排班系統，回到班表">
          <span class="brand-mark" aria-hidden="true"><q-icon name="medical_services" size="18px" /></span>
          <span class="brand-name">排班系統</span>
        </router-link>
        <span v-if="headerWard" class="header-ward">{{ headerWard }}</span>
        <q-space />

        <MailQueueIndicator class="q-mr-xs" />

        <q-btn flat no-caps dense class="account-btn" :aria-label="`帳號：${auth.displayName}`">
          <q-avatar size="30px" color="tint" text-color="on-tint">
            <img v-if="auth.user?.photoURL" :src="auth.user.photoURL" alt="" referrerpolicy="no-referrer" />
            <span v-else>{{ initial }}</span>
          </q-avatar>
          <span class="gt-sm q-ml-sm text-ink">{{ auth.displayName }}</span>
          <q-menu anchor="bottom right" self="top right">
            <q-card flat style="min-width: 260px">
              <q-card-section class="q-pb-sm">
                <div class="text-subtitle1 text-weight-bold">{{ auth.displayName }}</div>
                <div class="text-caption text-muted">{{ auth.email }}</div>
                <div class="text-caption text-muted q-mt-xs">{{ accountLine }}</div>
              </q-card-section>
              <q-separator />
              <q-list>
                <q-item v-close-popup clickable :to="{ name: 'help' }">
                  <q-item-section avatar><q-icon name="help_outline" /></q-item-section>
                  <q-item-section>使用說明</q-item-section>
                </q-item>
                <q-item v-close-popup clickable :to="{ name: 'about' }">
                  <q-item-section avatar><q-icon name="info_outline" /></q-item-section>
                  <q-item-section>About</q-item-section>
                </q-item>
                <q-item v-close-popup clickable class="text-negative" @click="logout">
                  <q-item-section avatar><q-icon name="logout" color="negative" /></q-item-section>
                  <q-item-section>登出</q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- Wide screens: every section in a sidebar, grouped by what people do there. -->
    <q-drawer v-if="!compact" v-model="drawer" show-if-above bordered :width="232" :breakpoint="1023" class="app-drawer">
      <nav aria-label="主要功能" class="column full-height no-wrap">
        <q-list padding class="q-px-sm">
          <q-item-label v-if="manageNav.length" header class="nav-group">日常</q-item-label>
          <q-item
            v-for="item in primaryNav"
            :key="item.name"
            v-ripple
            clickable
            :to="{ name: item.name }"
            active-class="nav-active"
            class="nav-item"
          >
            <q-item-section avatar class="nav-icon"><q-icon :name="item.icon" /></q-item-section>
            <q-item-section>{{ item.label }}</q-item-section>
            <q-item-section v-if="item.badge" side>
              <q-badge color="negative" rounded :aria-label="`${item.badge} 件待處理`">{{ item.badge }}</q-badge>
            </q-item-section>
          </q-item>

          <template v-if="manageNav.length">
            <q-item-label header class="nav-group">管理</q-item-label>
            <q-item
              v-for="item in manageNav"
              :key="item.name"
              v-ripple
              clickable
              :to="{ name: item.name }"
              active-class="nav-active"
              class="nav-item"
            >
              <q-item-section avatar class="nav-icon"><q-icon :name="item.icon" /></q-item-section>
              <q-item-section>{{ item.label }}</q-item-section>
            </q-item>
          </template>

          <q-separator class="q-my-sm" />
          <q-item v-ripple clickable :to="{ name: 'help' }" active-class="nav-active" class="nav-item">
            <q-item-section avatar class="nav-icon"><q-icon name="help_outline" /></q-item-section>
            <q-item-section>使用說明</q-item-section>
          </q-item>
          <q-item v-ripple clickable :to="{ name: 'about' }" active-class="nav-active" class="nav-item">
            <q-item-section avatar class="nav-icon"><q-icon name="info_outline" /></q-item-section>
            <q-item-section>About</q-item-section>
          </q-item>
        </q-list>
        <q-space />
        <div v-if="useEmulators || mail.provider === 'mock'" class="q-pa-md env-note">
          <div v-if="useEmulators">測試環境（Emulator）</div>
          <div v-if="mail.provider === 'mock'">郵件為{{ PROVIDER_LABELS.mock }}，不會真的寄出</div>
        </div>
      </nav>
    </q-drawer>

    <!-- Phones and tablets: a tab bar within thumb reach. 「更多」 holds management, help and the account. -->
    <q-footer v-if="compact" class="app-footer">
      <nav class="tabbar" aria-label="主要功能">
        <router-link
          v-for="t in tabs"
          :key="t.name"
          :to="{ name: t.name }"
          class="tabbar-item"
          :class="{ active: t.active }"
          :aria-current="t.active ? 'page' : undefined"
          :aria-label="t.badge ? `${t.label}，${t.badge} 件待處理` : t.label"
        >
          <span class="tabbar-icon" aria-hidden="true">
            <q-icon :name="t.icon" size="24px" />
            <span v-if="t.badge" class="tabbar-badge">{{ t.badge > 99 ? '99+' : t.badge }}</span>
          </span>
          <span class="tabbar-label" aria-hidden="true">{{ t.label }}</span>
        </router-link>
      </nav>
    </q-footer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import MailQueueIndicator from '@/components/MailQueueIndicator.vue';
import { provideSignOut } from '@/composables/useSignOut';
import { navForRole } from '@/constants/guide';
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
const route = useRoute();
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
const accountLine = computed(() =>
  [auth.role ? ROLE_LABELS[auth.role] : '', auth.profile?.schedulable ? auth.profile.level : '', auth.profile?.employeeId ?? '']
    .filter(Boolean)
    .join(' · '),
);

/** Below 1024px: bottom tab bar. From 1024px: sidebar. Same functions at every width. */
const compact = computed(() => $q.screen.lt.md);

const badges = computed<Record<string, number>>(() => ({ swaps: swaps.badge, leave: leaves.pending.length }));
const nav = computed(() => navForRole(auth.role));
const primaryNav = computed(() => nav.value.primary.map((n) => ({ ...n, badge: badges.value[n.name] ?? 0 })));
const manageNav = computed(() => nav.value.manage);

/** Pages reached through 「更多」 keep that tab selected, so people always know where they are. */
const MORE_PAGES = new Set(['more', 'help', 'about', 'calendar', 'wards', 'emails', 'staff', 'settings']);
const tabs = computed(() => {
  const current = String(route.name ?? '');
  return [
    ...primaryNav.value.map((n) => ({ ...n, active: current === n.name })),
    { name: 'more', label: '更多', icon: 'more_horiz', badge: 0, active: MORE_PAGES.has(current) },
  ];
});

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
provideSignOut(logout);
</script>

<style scoped lang="scss">
// Quiet chrome: the header is a surface, not a brand-coloured bar.
.app-header {
  background: var(--surface);
  color: var(--text);
  border-bottom: 1px solid var(--line);
}
.app-toolbar {
  min-height: 52px;
  padding: 0 8px 0 12px;
  gap: 4px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
  color: var(--text);
  text-decoration: none;
  border-radius: var(--radius-sm);
  padding: 4px 6px 4px 2px;
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
}
.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--focus);
  color: var(--surface);
}
.brand-name {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.header-ward {
  font-size: 0.8125rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--soft);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40vw;
}
.account-btn {
  padding: 2px 4px;
  border-radius: 999px;
}

.app-drawer :deep(.q-drawer) {
  background: var(--surface);
}
.nav-group {
  padding: 16px 12px 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.04em;
}
.nav-item {
  min-height: 44px;
  border-radius: var(--radius-sm);
  margin-bottom: 2px;
  color: var(--text);
}
.nav-icon {
  min-width: 40px;
  color: var(--text-2);
}
.nav-active .nav-icon {
  color: var(--on-tint);
}
.env-note {
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-2);
}

// Bottom tab bar: navigation only, always visible, filled icons with one-word labels.
.app-footer {
  background: var(--surface);
  color: var(--text-2);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom);
}
.tabbar {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  max-width: 40rem;
  margin: 0 auto;
}
.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 56px;
  padding: 6px 4px 4px;
  color: var(--text-2);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  &.active {
    color: var(--focus);
    .tabbar-label {
      font-weight: 700;
    }
  }
  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -4px;
    border-radius: var(--radius-sm);
  }
}
.tabbar-icon {
  position: relative;
  display: inline-flex;
}
.tabbar-badge {
  position: absolute;
  top: -4px;
  left: 16px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--error);
  color: var(--surface);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.tabbar-label {
  font-size: 0.75rem;
  line-height: 1.2;
}
</style>
