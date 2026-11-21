import type { RouteRecordRaw } from 'vue-router';
import type { UserRole } from '@/types/schedule';

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean;
    /** Restrict to these roles. */
    roles?: UserRole[];
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: { name: 'schedule' } },
      { path: 'schedule', name: 'schedule', component: () => import('@/pages/SchedulePage.vue') },
      { path: 'swaps', name: 'swaps', component: () => import('@/pages/SwapsPage.vue') },
      { path: 'leave', name: 'leave', component: () => import('@/pages/LeavePage.vue') },
      {
        path: 'emails',
        name: 'emails',
        component: () => import('@/pages/EmailLogPage.vue'),
        meta: { roles: ['developer', 'head_nurse'] },
      },
      {
        path: 'staff',
        name: 'staff',
        component: () => import('@/pages/StaffPage.vue'),
        meta: { roles: ['developer'] },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/SettingsPage.vue'),
        meta: { roles: ['developer'] },
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
    meta: { public: true },
  },
];

export default routes;
