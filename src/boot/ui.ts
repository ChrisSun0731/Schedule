import { defineBoot } from '#q-app';
import { Notify } from 'quasar';

/**
 * Notification types that differ from Quasar's defaults.
 * - Errors stay until dismissed: the global 2.5 s timeout is too short to read and act on one.
 * - Warnings use white text on the darker $warning.
 * Close buttons inherit the notification's text colour so they also work in dark mode.
 */
export default defineBoot(() => {
  Notify.registerType('negative', {
    color: 'negative',
    textColor: 'white',
    icon: 'report_problem',
    timeout: 0,
    actions: [{ icon: 'close', round: true, dense: true, 'aria-label': '關閉' }],
  });
  Notify.registerType('warning', { color: 'warning', textColor: 'white', icon: 'warning' });
});
