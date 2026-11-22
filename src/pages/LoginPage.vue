<template>
  <q-layout>
    <q-page-container>
      <q-page class="login-page flex flex-center q-pa-md">
        <q-card flat class="login-card">
          <q-card-section class="text-center q-pt-xl">
            <div class="brand-mark q-mx-auto q-mb-md" aria-hidden="true">
              <q-icon name="medical_services" size="34px" />
            </div>
            <h1 class="login-title">護理排班系統</h1>
            <p class="text-body2 text-muted q-mt-xs q-mb-none">安排 28 天輪班，線上換班與請假</p>
          </q-card-section>

          <!-- Firebase not configured -->
          <q-card-section v-if="!isFirebaseConfigured">
            <q-banner rounded class="bg-warn-soft text-on-warn">
              <template #avatar><q-icon name="settings_suggest" /></template>
              尚未設定 Firebase
              <div class="text-caption q-mt-xs">
                設定 <code>VITE_FIREBASE_*</code> 環境變數（見 <code>.env.example</code>）後重新建置。
              </div>
            </q-banner>
          </q-card-section>

          <q-card-section v-else-if="auth.status === 'loading'" class="flex flex-center q-py-xl">
            <q-spinner-dots size="40px" color="primary" aria-label="載入中" />
          </q-card-section>

          <!-- Signed in but no profile -->
          <q-card-section v-else-if="auth.status === 'unregistered' || auth.status === 'inactive'" class="text-center">
            <q-icon :name="auth.status === 'inactive' ? 'block' : 'person_off'" size="44px" class="text-subtle" />
            <div class="text-subtitle1 text-weight-medium q-mt-sm">
              {{ auth.status === 'inactive' ? '帳號已停用' : '帳號尚未註冊' }}
            </div>
            <q-chip outline color="muted" icon="mail" class="q-mt-sm">{{ auth.email }}</q-chip>
            <div class="text-body2 text-muted q-mt-sm">
              {{ auth.status === 'inactive' ? '此帳號已被停用，請聯絡系統管理員重新啟用。' : '請聯絡系統管理員，在「人員管理」以此 Email 為你建立帳號。' }}
            </div>
            <q-btn class="q-mt-md full-width" unelevated no-caps color="soft" text-color="ink" label="切換帳號" @click="switchAccount" />
          </q-card-section>

          <!-- Sign in -->
          <q-card-section v-else class="q-px-lg q-pb-lg">
            <!-- What the system is for, before asking anyone to sign in. -->
            <ul class="features">
              <li v-for="f in features" :key="f.title">
                <q-icon :name="f.icon" size="22px" class="text-muted" aria-hidden="true" />
                <div>
                  <div class="feature-title">{{ f.title }}</div>
                  <div class="feature-text">{{ f.text }}</div>
                </div>
              </li>
            </ul>
            <q-btn
              unelevated
              no-caps
              class="google-btn full-width"
              :loading="busy"
              @click="signIn"
            >
              <svg class="q-mr-sm" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              使用 Google 帳號登入
            </q-btn>
            <p class="hint text-center q-mt-sm">請使用已登記的 Google 帳號。沒有帳號時，請聯絡系統管理員。</p>

            <q-banner v-if="auth.error" dense rounded class="bg-error-soft text-negative q-mt-md" role="alert">
              <template #avatar><q-icon name="error_outline" /></template>
              {{ auth.error }}
            </q-banner>

            <q-expansion-item
              v-if="useEmulators"
              dense
              icon="science"
              label="測試帳號（Emulator）"
              class="q-mt-lg emu-box"
              header-class="text-on-warn"
            >
              <div class="q-pa-sm">
                <div class="row q-gutter-xs q-mb-sm">
                  <q-chip
                    v-for="acc in testAccounts"
                    :key="acc.email"
                    clickable
                    dense
                    outline
                    color="on-warn"
                    @click="emuSignIn(acc.email)"
                  >
                    {{ acc.label }}
                  </q-chip>
                </div>
                <q-input v-model="emuEmail" dense outlined type="email" label="Email" @keyup.enter="emuSignIn(emuEmail)">
                  <template #append>
                    <q-btn flat dense round icon="login" aria-label="以此 Email 登入" @click="emuSignIn(emuEmail)" />
                  </template>
                </q-input>
              </div>
            </q-expansion-item>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isFirebaseConfigured, useEmulators } from '@/services/firebase';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const busy = ref(false);
const emuEmail = ref('');

const features = [
  { icon: 'calendar_month', title: '班表', text: '隨時查看自己的班與下一班時間，並加入 Google 日曆。' },
  { icon: 'swap_horiz', title: '換班', text: '直接向同事提出，系統自動檢查是否符合排班規則。' },
  { icon: 'event_busy', title: '請假', text: '線上申請，護理長核准後自動排入班表。' },
];

const testAccounts = [
  { label: '系統管理員', email: 'admin@example.com' },
  { label: '護理長（5A、ICU）', email: 'head@example.com' },
  { label: '護理師 01（5A）', email: 'nurse01@example.com' },
  { label: '護理師 02（5A）', email: 'nurse02@example.com' },
  { label: '護理師 31（ICU）', email: 'nurse31@example.com' },
];

watch(
  () => auth.status,
  (status) => {
    if (status === 'ready') {
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/schedule';
      void router.replace(redirect.startsWith('/') ? redirect : '/schedule');
    }
  },
  { immediate: true },
);

async function signIn(): Promise<void> {
  busy.value = true;
  try {
    await auth.signInWithGoogle();
  } finally {
    busy.value = false;
  }
}

async function emuSignIn(email: string): Promise<void> {
  if (!email) return;
  await auth.signInWithEmulatorAccount(email.trim().toLowerCase());
}

async function switchAccount(): Promise<void> {
  await auth.logout();
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--page);
}
.login-card {
  width: 400px;
  max-width: 100%;
  border-radius: 16px;
  border: 1px solid var(--line);
  box-shadow: var(--card-shadow);
}
.login-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: normal;
}
// The product mark keeps the brand teal in both appearances.
.brand-mark {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f6e72;
  color: #fff;
}
// Google's sign-in button: neutral light theme, and the dark theme in dark mode.
.google-btn {
  background: #fff;
  color: #3c4043;
  border: 1px solid #dadce0;
  height: 46px;
  font-weight: 500;
  font-size: 0.9375rem;
}
body.body--dark .google-btn {
  background: #131314;
  color: #e3e3e3;
  border-color: #8e918f;
}
.features {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
  display: grid;
  gap: 12px;
  li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
}
.feature-title {
  font-weight: 600;
}
.feature-text {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text-2);
}
.emu-box {
  border: 1px dashed var(--warn);
  border-radius: 10px;
}
</style>
