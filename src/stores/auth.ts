import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import { auth, db, errorMessage, isFirebaseConfigured, useEmulators } from '@/services/firebase';
import type { UserProfile } from '@/types/schedule';
import { normalizeUser } from '@/stores/users';

export type AuthStatus = 'loading' | 'signed_out' | 'unregistered' | 'inactive' | 'ready' | 'error';

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<User | null>(null);
  const profile = ref<UserProfile | null>(null);
  const status = ref<AuthStatus>('loading');
  const error = ref('');

  let initialized = false;
  let unsubProfile: Unsubscribe | null = null;
  let resolveReady: () => void = () => undefined;
  /** Resolves once the initial auth state (and profile, if signed in) is known. */
  const ready = new Promise<void>((resolve) => (resolveReady = resolve));

  const email = computed(() => user.value?.email?.toLowerCase() ?? '');
  const role = computed(() => profile.value?.role ?? null);
  const isDeveloper = computed(() => role.value === 'developer');
  const isManager = computed(() => role.value === 'developer' || role.value === 'head_nurse');
  const displayName = computed(() => profile.value?.displayName || user.value?.displayName || email.value);

  function init(): Promise<void> {
    if (initialized) return ready;
    initialized = true;
    if (!isFirebaseConfigured) {
      status.value = 'signed_out';
      resolveReady();
      return ready;
    }
    getRedirectResult(auth()).catch((err) => (error.value = errorMessage(err)));
    onAuthStateChanged(auth(), (u) => void handleUser(u));
    return ready;
  }

  async function handleUser(u: User | null): Promise<void> {
    unsubProfile?.();
    unsubProfile = null;
    user.value = u;
    if (!u) {
      profile.value = null;
      status.value = 'signed_out';
      resolveReady();
      return;
    }
    status.value = 'loading';
    const mail = u.email?.toLowerCase();
    if (!mail) {
      status.value = 'error';
      error.value = '此 Google 帳號沒有 Email';
      resolveReady();
      return;
    }
    const ref = doc(db(), 'users', mail);
    try {
      let snap = await getDoc(ref);
      if (!snap.exists()) {
        // First developer bootstrap – only succeeds for e-mails listed in firestore.rules.
        try {
          const now = Date.now();
          await setDoc(ref, {
            id: mail,
            email: mail,
            displayName: u.displayName || (mail.split('@')[0] ?? mail),
            employeeId: '',
            role: 'developer',
            level: 'N3',
            allowedShifts: ['D', 'E', 'N'],
            schedulable: false,
            active: true,
            uid: u.uid,
            photoURL: u.photoURL ?? null,
            lastLoginAt: now,
            createdAt: now,
            updatedAt: now,
          } satisfies UserProfile);
          snap = await getDoc(ref);
        } catch {
          /* not a bootstrap account */
        }
      }
      if (!snap.exists()) {
        profile.value = null;
        status.value = 'unregistered';
        resolveReady();
        return;
      }
      void updateDoc(ref, { uid: u.uid, photoURL: u.photoURL ?? null, lastLoginAt: Date.now() }).catch(() => undefined);
      await new Promise<void>((resolve) => {
        unsubProfile = onSnapshot(
          ref,
          (s) => {
            if (!s.exists()) {
              profile.value = null;
              status.value = 'unregistered';
            } else {
              const p = normalizeUser(s.id, s.data());
              profile.value = p;
              status.value = p.active ? 'ready' : 'inactive';
            }
            resolve();
          },
          (err) => {
            error.value = errorMessage(err);
            status.value = 'error';
            resolve();
          },
        );
      });
    } catch (err) {
      error.value = errorMessage(err);
      status.value = 'error';
    }
    resolveReady();
  }

  async function signInWithGoogle(): Promise<void> {
    error.value = '';
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth(), provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth(), provider);
        return;
      }
      error.value = errorMessage(err);
    }
  }

  /** Emulator only: sign in as any e-mail without the Google popup. */
  async function signInWithEmulatorAccount(mail: string): Promise<void> {
    if (!useEmulators) return;
    error.value = '';
    const credential = GoogleAuthProvider.credential(
      JSON.stringify({ sub: `emu-${mail}`, email: mail, email_verified: true, name: mail.split('@')[0] }),
    );
    try {
      await signInWithCredential(auth(), credential);
    } catch (err) {
      error.value = errorMessage(err);
    }
  }

  async function logout(): Promise<void> {
    unsubProfile?.();
    unsubProfile = null;
    await signOut(auth());
  }

  return {
    user,
    profile,
    status,
    error,
    ready,
    email,
    role,
    isDeveloper,
    isManager,
    displayName,
    init,
    signInWithGoogle,
    signInWithEmulatorAccount,
    logout,
  };
});
