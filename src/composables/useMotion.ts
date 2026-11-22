import { onBeforeUnmount, ref, type Ref } from 'vue';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the person has asked the system to reduce motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** `smooth` unless Reduce Motion is on. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/** Reactive Reduce Motion flag, for props such as `<q-tab-panels :animated>`. */
export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(prefersReducedMotion());
  if (typeof window === 'undefined' || !window.matchMedia) return reduced;
  const mq = window.matchMedia(QUERY);
  const onChange = (e: MediaQueryListEvent) => (reduced.value = e.matches);
  mq.addEventListener('change', onChange);
  onBeforeUnmount(() => mq.removeEventListener('change', onChange));
  return reduced;
}
