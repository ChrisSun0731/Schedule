/**
 * E-mail delivery: provider-agnostic transports + a throttled, retrying dispatch queue
 * with per-recipient delivery status and an audit log (`email_logs`).
 *
 * Providers (VITE_EMAIL_PROVIDER):
 *   mock       Simulated delivery for demos/tests (no e-mail leaves the browser).
 *   firestore  Writes to the `mail` collection consumed by the Firebase "Trigger Email"
 *              extension (SMTP → AWS SES / Resend SMTP / any SMTP). Waits for `delivery.state`.
 *   function   Calls the `sendEmail` callable Cloud Function (functions/ – Resend API or AWS SES).
 *   emailjs    Sends directly from the browser through EmailJS.
 */
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, envString, functions } from '@/services/firebase';
import type { DeliveryStatus, EmailProviderId, EmailType } from '@/types/schedule';

export interface EmailMessage {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  type: EmailType;
  scheduleId?: string;
  swapId?: string;
}

export interface SenderInfo {
  email: string;
  name: string;
}

export interface EmailTransport {
  readonly id: EmailProviderId;
  /** Resolves when the provider accepted the message; rejects with a readable error otherwise. */
  send(message: EmailMessage, sender: SenderInfo): Promise<void>;
}

export const PROVIDER_LABELS: Record<EmailProviderId, string> = {
  mock: '模擬寄送',
  firestore: 'Firebase Trigger Email',
  function: 'Cloud Functions',
  emailjs: 'EmailJS',
};

const PROVIDERS: EmailProviderId[] = ['mock', 'firestore', 'function', 'emailjs'];

const configuredProvider = envString('VITE_EMAIL_PROVIDER') as EmailProviderId;
export const emailProvider: EmailProviderId = PROVIDERS.includes(configuredProvider) ? configuredProvider : 'mock';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/** Simulated delivery. ~10% of first attempts fail so the retry path is visible in demos. */
export class MockTransport implements EmailTransport {
  readonly id = 'mock' as const;
  private attempts = new Map<string, number>();

  constructor(private readonly firstAttemptFailureRate = 0.1) {}

  async send(message: EmailMessage): Promise<void> {
    await sleep(250 + Math.random() * 450);
    const key = `${message.type}|${message.to}|${message.subject}`;
    const n = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, n);
    if (n === 1 && Math.random() < this.firstAttemptFailureRate) throw new Error('模擬：郵件伺服器暫時無回應');
    console.info('[mock e-mail]', message.to, message.subject);
  }
}

/** Firebase "Trigger Email" extension (`mail` collection). */
export class FirestoreQueueTransport implements EmailTransport {
  readonly id = 'firestore' as const;

  constructor(private readonly waitMs = 20_000) {}

  async send(message: EmailMessage, sender: SenderInfo): Promise<void> {
    const ref = await addDoc(collection(db(), 'mail'), {
      to: message.to,
      message: { subject: message.subject, html: message.html, text: message.text },
      createdBy: sender.email,
      type: message.type,
      scheduleId: message.scheduleId ?? null,
      swapId: message.swapId ?? null,
      createdAt: Date.now(),
    });
    // Wait for the extension to report the SMTP result. If it is slow we still treat the
    // message as accepted: the extension retries on its own.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        resolve();
      }, this.waitMs);
      const unsub = onSnapshot(
        doc(db(), 'mail', ref.id),
        (snap) => {
          const state = snap.get('delivery.state') as string | undefined;
          if (state === 'SUCCESS') {
            clearTimeout(timer);
            unsub();
            resolve();
          } else if (state === 'ERROR') {
            clearTimeout(timer);
            unsub();
            reject(new Error(String(snap.get('delivery.error') ?? 'SMTP 寄送失敗')));
          }
        },
        () => {
          // Could not observe delivery (e.g. offline) – the queue write itself succeeded.
          clearTimeout(timer);
          resolve();
        },
      );
    });
  }
}

/** Callable Cloud Function `sendEmail` (see functions/src/index.ts). */
export class CloudFunctionTransport implements EmailTransport {
  readonly id = 'function' as const;

  async send(message: EmailMessage): Promise<void> {
    const call = httpsCallable<EmailMessage, { id?: string }>(functions(), 'sendEmail');
    await call(message);
  }
}

/** EmailJS REST API. Template variables: to_email, to_name, subject, html_body, text_body, from_name. */
export class EmailJsTransport implements EmailTransport {
  readonly id = 'emailjs' as const;

  async send(message: EmailMessage, sender: SenderInfo): Promise<void> {
    const serviceId = envString('VITE_EMAILJS_SERVICE_ID');
    const templateId = envString('VITE_EMAILJS_TEMPLATE_ID');
    const publicKey = envString('VITE_EMAILJS_PUBLIC_KEY');
    if (!serviceId || !templateId || !publicKey) throw new Error('EmailJS 尚未設定');
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: message.to,
          to_name: message.toName,
          subject: message.subject,
          html_body: message.html,
          text_body: message.text,
          from_name: sender.name,
        },
      }),
    });
    if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`);
  }
}

export function createTransport(provider: EmailProviderId = emailProvider): EmailTransport {
  switch (provider) {
    case 'firestore':
      return new FirestoreQueueTransport();
    case 'function':
      return new CloudFunctionTransport();
    case 'emailjs':
      return new EmailJsTransport();
    default:
      return new MockTransport();
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface EmailLogger {
  create(job: DispatchJob): Promise<string | null>;
  update(logId: string, job: DispatchJob): Promise<void>;
}

export function firestoreEmailLogger(sender: SenderInfo, provider: EmailProviderId): EmailLogger {
  return {
    async create(job) {
      try {
        const now = Date.now();
        const ref = await addDoc(collection(db(), 'email_logs'), {
          type: job.message.type,
          to: job.message.to,
          toName: job.message.toName,
          subject: job.message.subject,
          status: job.status,
          attempts: job.attempts,
          error: null,
          provider,
          scheduleId: job.message.scheduleId ?? null,
          swapId: job.message.swapId ?? null,
          sentBy: sender.email,
          createdAt: now,
          updatedAt: now,
        });
        return ref.id;
      } catch (err) {
        console.warn('email log create failed', err);
        return null;
      }
    },
    async update(logId, job) {
      try {
        await updateDoc(doc(db(), 'email_logs', logId), {
          status: job.status,
          attempts: job.attempts,
          error: job.error,
          updatedAt: Date.now(),
        });
      } catch (err) {
        console.warn('email log update failed', err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch queue
// ---------------------------------------------------------------------------

export interface DispatchJob {
  id: string;
  message: EmailMessage;
  status: DeliveryStatus;
  attempts: number;
  error: string | null;
  logId: string | null;
  updatedAt: number;
}

export interface DispatcherOptions {
  /** Messages in flight at the same time. */
  concurrency: number;
  /** Minimum gap between two send starts (provider rate limits). */
  minIntervalMs: number;
  /** Automatic attempts per message before it is marked failed. */
  maxAttempts: number;
  /** First retry delay; doubles on each attempt. */
  backoffMs: number;
}

export const DEFAULT_DISPATCH_OPTIONS: DispatcherOptions = {
  concurrency: 2,
  minIntervalMs: 350,
  maxAttempts: 3,
  backoffMs: 1500,
};

export interface DispatcherHooks {
  sender: SenderInfo;
  /** Lets a UI layer wrap jobs (e.g. Vue `reactive`). Must return the object to mutate. */
  wrap?: (job: DispatchJob) => DispatchJob;
  logger?: EmailLogger;
}

let jobSeq = 0;

export class EmailDispatcher {
  readonly jobs: DispatchJob[] = [];
  private readonly queue: DispatchJob[] = [];
  private readonly waiters = new Map<string, ((job: DispatchJob) => void)[]>();
  private active = 0;
  private lastStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: DispatcherOptions;

  constructor(
    private readonly transport: EmailTransport,
    private readonly hooks: DispatcherHooks,
    options: Partial<DispatcherOptions> = {},
  ) {
    this.options = { ...DEFAULT_DISPATCH_OPTIONS, ...options };
  }

  get providerId(): EmailProviderId {
    return this.transport.id;
  }

  enqueue(messages: EmailMessage[]): DispatchJob[] {
    const created = messages.map((message) => {
      const raw: DispatchJob = {
        id: `job-${Date.now()}-${++jobSeq}`,
        message,
        status: 'queued',
        attempts: 0,
        error: null,
        logId: null,
        updatedAt: Date.now(),
      };
      const job = this.hooks.wrap ? this.hooks.wrap(raw) : raw;
      this.jobs.push(job);
      this.queue.push(job);
      void this.hooks.logger?.create(job).then((id) => {
        job.logId = id;
      });
      return job;
    });
    this.pump();
    return created;
  }

  /** Resolves when the job reaches a final state (`sent` or `failed`). */
  waitFor(job: DispatchJob): Promise<DispatchJob> {
    if (job.status === 'sent' || job.status === 'failed') return Promise.resolve(job);
    return new Promise((resolve) => {
      const list = this.waiters.get(job.id) ?? [];
      list.push(resolve);
      this.waiters.set(job.id, list);
    });
  }

  /** Manually retry a failed job (gets a fresh set of automatic attempts). */
  retry(job: DispatchJob): void {
    if (job.status !== 'failed') return;
    job.attempts = 0;
    job.error = null;
    this.setStatus(job, 'queued');
    this.queue.push(job);
    this.pump();
  }

  retryFailed(): void {
    this.jobs.filter((j) => j.status === 'failed').forEach((j) => this.retry(j));
  }

  /** Forget finished jobs (keeps queued/in-flight ones). */
  clearFinished(): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const s = this.jobs[i]!.status;
      if (s === 'sent' || s === 'failed') this.jobs.splice(i, 1);
    }
  }

  private setStatus(job: DispatchJob, status: DeliveryStatus): void {
    job.status = status;
    job.updatedAt = Date.now();
    if (job.logId) void this.hooks.logger?.update(job.logId, job);
  }

  private pump(): void {
    if (this.timer) return;
    while (this.active < this.options.concurrency && this.queue.length) {
      const wait = this.lastStart + this.options.minIntervalMs - Date.now();
      if (wait > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.pump();
        }, wait);
        return;
      }
      const job = this.queue.shift()!;
      this.lastStart = Date.now();
      void this.run(job);
    }
  }

  private async run(job: DispatchJob): Promise<void> {
    this.active++;
    job.attempts++;
    this.setStatus(job, 'sending');
    try {
      await this.transport.send(job.message, this.hooks.sender);
      job.error = null;
      this.setStatus(job, 'sent');
      this.settle(job);
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      if (job.attempts < this.options.maxAttempts) {
        this.setStatus(job, 'retrying');
        const delay = this.options.backoffMs * 2 ** (job.attempts - 1);
        setTimeout(() => {
          this.queue.push(job);
          this.pump();
        }, delay);
      } else {
        this.setStatus(job, 'failed');
        this.settle(job);
      }
    } finally {
      this.active--;
      this.pump();
    }
  }

  private settle(job: DispatchJob): void {
    const list = this.waiters.get(job.id);
    this.waiters.delete(job.id);
    list?.forEach((resolve) => resolve(job));
  }
}
