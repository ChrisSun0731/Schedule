import { inject, provide, type InjectionKey } from 'vue';

const KEY: InjectionKey<() => Promise<void>> = Symbol('sign-out');

/** MainLayout provides the sign-out that first stops every Firestore listener (no permission errors on the way out). */
export function provideSignOut(fn: () => Promise<void>): void {
  provide(KEY, fn);
}

/** Sign out from any page inside MainLayout. */
export function useSignOut(): () => Promise<void> {
  const fn = inject(KEY);
  if (!fn) throw new Error('useSignOut() is only available inside MainLayout');
  return fn;
}
