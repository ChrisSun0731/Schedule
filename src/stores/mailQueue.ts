import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import {
  EmailDispatcher,
  createTransport,
  emailProvider,
  firestoreEmailLogger,
  type DispatchJob,
  type EmailMessage,
} from '@/services/emailService';
import { renderScheduleEmail } from '@/services/emailTemplates';
import type { Schedule } from '@/types/schedule';
import { scheduleDays } from '@/utils/scheduleHelpers';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useWardsStore } from '@/stores/wards';

/**
 * App-wide e-mail queue. Jobs survive closing dialogs so a global banner can keep
 * showing progress while a publish broadcast is still being delivered.
 */
export const useMailQueueStore = defineStore('mailQueue', () => {
  const jobs = ref<DispatchJob[]>([]);
  /** Jobs of the latest schedule broadcast (shown in the publish dialog). */
  const broadcast = ref<DispatchJob[]>([]);
  const provider = emailProvider;

  let dispatcher: EmailDispatcher | null = null;
  let dispatcherSender = '';

  function getDispatcher(): EmailDispatcher {
    const auth = useAuthStore();
    const settings = useSettingsStore();
    const sender = { email: auth.email, name: settings.settings.emailSenderName };
    if (!dispatcher || dispatcherSender !== sender.email) {
      dispatcher = new EmailDispatcher(createTransport(provider), {
        sender,
        wrap: (job) => reactive(job) as DispatchJob,
        logger: firestoreEmailLogger(sender, provider),
      });
      dispatcherSender = sender.email;
    }
    return dispatcher;
  }

  function enqueue(messages: EmailMessage[]): DispatchJob[] {
    const created = getDispatcher().enqueue(messages);
    jobs.value.push(...created);
    return created;
  }

  /** Send one message and resolve with its final state. */
  async function sendOne(message: EmailMessage): Promise<DispatchJob> {
    const [job] = enqueue([message]);
    return getDispatcher().waitFor(job!);
  }

  function scheduleMessages(schedule: Schedule): EmailMessage[] {
    const settings = useSettingsStore();
    const days = scheduleDays(schedule);
    return schedule.nurseOrder
      .map((id) => schedule.nurses[id])
      .filter((n): n is NonNullable<typeof n> => !!n?.email)
      .map((nurse) => {
        const mail = renderScheduleEmail({
          wardName: useWardsStore().nameOf(schedule.wardId),
          nurse,
          row: schedule.assignments[nurse.id] ?? [],
          days,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          portalUrl: settings.portalUrl,
          scheduleId: schedule.id,
        });
        return { ...mail, to: nurse.email, toName: nurse.name, type: 'schedule' as const, scheduleId: schedule.id };
      });
  }

  function sendSchedule(schedule: Schedule): DispatchJob[] {
    broadcast.value = enqueue(scheduleMessages(schedule));
    return broadcast.value;
  }

  function retry(job: DispatchJob): void {
    dispatcher?.retry(job);
  }

  function retryFailed(): void {
    dispatcher?.retryFailed();
  }

  function clearFinished(): void {
    const done = (j: DispatchJob) => j.status === 'sent' || j.status === 'failed';
    jobs.value = jobs.value.filter((j) => !done(j));
    broadcast.value = broadcast.value.filter((j) => !done(j));
    dispatcher?.clearFinished();
  }

  function statsOf(list: DispatchJob[]) {
    const sent = list.filter((j) => j.status === 'sent').length;
    const failed = list.filter((j) => j.status === 'failed').length;
    const total = list.length;
    return { total, sent, failed, pending: total - sent - failed, progress: total ? (sent + failed) / total : 0 };
  }

  const stats = computed(() => statsOf(jobs.value));
  const broadcastStats = computed(() => statsOf(broadcast.value));

  return {
    jobs,
    broadcast,
    provider,
    stats,
    broadcastStats,
    enqueue,
    sendOne,
    sendSchedule,
    scheduleMessages,
    retry,
    retryFailed,
    clearFinished,
  };
});
