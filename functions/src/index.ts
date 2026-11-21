/**
 * Callable `sendEmail` – delivers e-mails for the nursing scheduling system through
 * Resend (HTTP API) or AWS SES (v2 API).
 *
 * Authorisation (mirrors firestore.rules):
 *   - developer / head_nurse: any recipient (schedule broadcasts, swap notices);
 *   - nurse: only swap e-mails to the counterpart of a swap request they are part of.
 *
 * Configuration (firebase functions:config is deprecated – use params):
 *   MAIL_PROVIDER   "resend" (default) | "ses"
 *   MAIL_FROM       e.g. "護理排班系統 <noreply@your-hospital.tw>"
 *   SES_REGION      e.g. "ap-northeast-1" (SES only)
 *   MAIL_API_KEY    secret – Resend API key, or "ACCESS_KEY_ID:SECRET_ACCESS_KEY" for SES
 *
 *   firebase functions:secrets:set MAIL_API_KEY
 *   firebase deploy --only functions
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/https';
import { defineSecret, defineString } from 'firebase-functions/params';

initializeApp();
const db = getFirestore();

const MAIL_PROVIDER = defineString('MAIL_PROVIDER', { default: 'resend', description: 'resend | ses' });
const MAIL_FROM = defineString('MAIL_FROM', { description: 'Sender address, e.g. 護理排班系統 <noreply@example.tw>' });
const SES_REGION = defineString('SES_REGION', { default: 'ap-northeast-1' });
const MAIL_API_KEY = defineSecret('MAIL_API_KEY');

type EmailType = 'schedule' | 'swap_request' | 'swap_result';

interface SendEmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  type: EmailType;
  scheduleId?: string;
  swapId?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(data: unknown): SendEmailPayload {
  const d = (data ?? {}) as Partial<SendEmailPayload>;
  if (typeof d.to !== 'string' || !EMAIL_RE.test(d.to)) throw new HttpsError('invalid-argument', '收件人 Email 無效');
  if (typeof d.subject !== 'string' || !d.subject || d.subject.length > 300) throw new HttpsError('invalid-argument', '主旨無效');
  if (typeof d.html !== 'string' || !d.html || d.html.length > 200_000) throw new HttpsError('invalid-argument', '內容無效');
  if (!['schedule', 'swap_request', 'swap_result'].includes(d.type as string)) throw new HttpsError('invalid-argument', '郵件類型無效');
  return {
    to: d.to.trim().toLowerCase(),
    toName: typeof d.toName === 'string' ? d.toName : '',
    subject: d.subject,
    html: d.html,
    text: typeof d.text === 'string' ? d.text : '',
    type: d.type as EmailType,
    scheduleId: typeof d.scheduleId === 'string' ? d.scheduleId : undefined,
    swapId: typeof d.swapId === 'string' ? d.swapId : undefined,
  };
}

async function authorise(email: string, payload: SendEmailPayload): Promise<void> {
  const profile = await db.doc(`users/${email}`).get();
  if (!profile.exists || profile.get('active') !== true) throw new HttpsError('permission-denied', '帳號未註冊或已停用');
  const role = profile.get('role') as string;
  if (role === 'developer' || role === 'head_nurse') return;

  if (payload.type === 'schedule' || !payload.swapId) throw new HttpsError('permission-denied', '權限不足');
  const swap = await db.doc(`swap_requests/${payload.swapId}`).get();
  if (!swap.exists) throw new HttpsError('not-found', '換班申請不存在');
  const s = swap.data() ?? {};
  const allowed =
    (s.requesterId === email && String(s.targetEmail).toLowerCase() === payload.to) ||
    (s.targetId === email && String(s.requesterEmail).toLowerCase() === payload.to);
  if (!allowed) throw new HttpsError('permission-denied', '只能寄送給換班對象');
}

async function sendWithResend(p: SendEmailPayload): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MAIL_API_KEY.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM.value(), to: [p.to], subject: p.subject, html: p.html, text: p.text || undefined }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? res.statusText}`);
  return body.id ?? '';
}

let ses: SESv2Client | null = null;

async function sendWithSes(p: SendEmailPayload): Promise<string> {
  if (!ses) {
    const [accessKeyId = '', secretAccessKey = ''] = MAIL_API_KEY.value().split(':');
    ses = new SESv2Client({ region: SES_REGION.value(), credentials: { accessKeyId, secretAccessKey } });
  }
  const out = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: MAIL_FROM.value(),
      Destination: { ToAddresses: [p.to] },
      Content: {
        Simple: {
          Subject: { Data: p.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: p.html, Charset: 'UTF-8' },
            ...(p.text ? { Text: { Data: p.text, Charset: 'UTF-8' } } : {}),
          },
        },
      },
    }),
  );
  return out.MessageId ?? '';
}

export const sendEmail = onCall(
  { region: 'asia-east1', secrets: [MAIL_API_KEY], maxInstances: 5, timeoutSeconds: 30 },
  async (request) => {
    const token = request.auth?.token;
    if (!token?.email || token.email_verified !== true) throw new HttpsError('unauthenticated', '請先登入');
    const email = token.email.toLowerCase();
    const payload = validate(request.data);
    await authorise(email, payload);

    try {
      const id = MAIL_PROVIDER.value() === 'ses' ? await sendWithSes(payload) : await sendWithResend(payload);
      logger.info('email sent', { to: payload.to, type: payload.type, by: email, id });
      return { id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('email failed', { to: payload.to, type: payload.type, by: email, message });
      throw new HttpsError('internal', message);
    }
  },
);
