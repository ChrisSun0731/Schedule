import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

/**
 * Read a VITE_* variable as a string. Quasar CLI parses env values, so "true" arrives as a
 * boolean and an all-digit messagingSenderId as a number – normalise everything here.
 */
export function envString(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key] as unknown;
  return value === undefined || value === null ? '' : String(value).trim();
}

export const useEmulators = envString('VITE_USE_EMULATORS') === 'true';

const firebaseConfig = {
  apiKey: envString('VITE_FIREBASE_API_KEY') || (useEmulators ? 'demo-api-key' : ''),
  authDomain: envString('VITE_FIREBASE_AUTH_DOMAIN') || (useEmulators ? 'demo-nursing-schedule.firebaseapp.com' : ''),
  projectId: envString('VITE_FIREBASE_PROJECT_ID') || (useEmulators ? 'demo-nursing-schedule' : ''),
  storageBucket: envString('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: envString('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: envString('VITE_FIREBASE_APP_ID'),
};

/** False when the build has no Firebase configuration (the login page shows setup help). */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;

function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error('Firebase 尚未設定（請設定 VITE_FIREBASE_* 環境變數）');
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(ensureApp());
    authInstance.languageCode = 'zh-TW';
    if (useEmulators) connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return authInstance;
}

export function db(): Firestore {
  if (!dbInstance) {
    dbInstance = initializeFirestore(ensureApp(), {
      // Offline cache keeps the roster readable on flaky ward Wi-Fi.
      localCache: useEmulators
        ? memoryLocalCache()
        : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
    if (useEmulators) connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
  }
  return dbInstance;
}

export function functions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(ensureApp(), envString('VITE_FIREBASE_FUNCTIONS_REGION') || 'asia-east1');
    if (useEmulators) connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
  }
  return functionsInstance;
}

/** Firestore/Firebase error → short Traditional Chinese message. */
export function errorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'permission-denied': '權限不足',
    unavailable: '無法連線，請稍後再試',
    'not-found': '資料不存在',
    aborted: '資料已被他人更新，請重試',
    'failed-precondition': '操作條件不符',
    'auth/popup-closed-by-user': '已取消登入',
    'auth/cancelled-popup-request': '已取消登入',
    'auth/network-request-failed': '網路連線失敗',
    'auth/unauthorized-domain': '此網域尚未加入 Firebase 授權網域',
    'functions/permission-denied': '權限不足',
    'functions/unauthenticated': '請重新登入',
  };
  if (map[code]) return map[code];
  if (err instanceof Error && err.message) return err.message;
  return '發生未知錯誤';
}
