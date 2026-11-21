import { defineBoot } from '#q-app';
import { useAuthStore } from '@/stores/auth';

/**
 * Starts Firebase Auth and guards every route:
 * - routes without `meta.public` need a registered, active profile;
 * - `meta.roles` restricts a route to the listed roles.
 * (Firestore security rules enforce the same permissions server-side.)
 */
export default defineBoot(({ router, store }) => {
  const auth = useAuthStore(store);
  void auth.init();

  router.beforeEach(async (to) => {
    await auth.ready;
    if (to.meta.public) return true;
    if (auth.status !== 'ready') {
      return { name: 'login', query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
    }
    const roles = to.meta.roles;
    if (roles && (!auth.role || !roles.includes(auth.role))) return { name: 'schedule' };
    return true;
  });
});
