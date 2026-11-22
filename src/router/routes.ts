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
      /** Landing page of the e-mail "加入 Google 日曆" button (?schedule=<id>). */
      { path: 'calendar', name: 'calendar', component: () => import('@/pages/CalendarPage.vue') },
      /** Phones and tablets: the 「更多」 tab (management pages, help, account). */
      { path: 'more', name: 'more', component: () => import('@/pages/MorePage.vue') },
      /** Every function explained, for the signed-in role. */
      { path: 'help', name: 'help', component: () => import('@/pages/HelpPage.vue') },
      /** What the system is, how it handles data, who to contact, version info. */
      { path: 'about', name: 'about', component: () => import('@/pages/AboutPage.vue') },
      {
        path: 'wards',
        name: 'wards',
        component: () => import('@/pages/WardsPage.vue'),
        meta: { roles: ['developer', 'head_nurse'] },
      },
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
