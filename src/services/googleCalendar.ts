/**
 * Writes a nurse's shifts into their own Google Calendar (primary calendar) straight from
 * the browser – no backend needed.
 *
 * Access: the user already signs in with Google through Firebase Auth. Re-authenticating
 * with the extra `calendar.events` scope returns a short-lived OAuth access token (kept in
 * memory only). One-time project setup – see README "Google 日曆":
 *   1. Google Cloud console → APIs & Services → enable "Google Calendar API".
 *   2. OAuth consent screen → add the scope …/auth/calendar.events.
 *
 * Sync is idempotent: events carry deterministic ids and a private extended property with
 * the schedule id, so syncing again (e.g. after a swap) updates/removes instead of duplicating.
 */
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { GOOGLE_SCHEDULE_PROPERTY, googleEventBody, type ShiftEvent } from '@/services/calendarExport';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export class CalendarError extends Error {
  constructor(
    message: string,
    /** `auth` = token rejected (ask again), `setup` = project not configured, `scope` = permission unticked. */
    readonly kind: 'auth' | 'setup' | 'scope' | 'cancelled' | 'other' = 'other',
    /** HTTP status of a failed Calendar API call (0 otherwise). */
    readonly status = 0,
  ) {
    super(message);
  }
}

let cached: { email: string; token: string; expires: number } | null = null;

/** Opens Google's consent popup (must run inside a click handler) and returns an access token. */
export async function requestCalendarAccess(): Promise<string> {
  const user = auth().currentUser;
  if (!user?.email) throw new CalendarError('請先登入', 'auth');
  const email = user.email.toLowerCase();
  if (cached && cached.email === email && cached.expires > Date.now()) return cached.token;

  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters({ login_hint: email });
  try {
    const result = await reauthenticateWithPopup(user, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new CalendarError('Google 沒有回傳日曆授權，請再試一次');
    // Google access tokens last one hour; renew a little early.
    cached = { email, token, expires: Date.now() + 50 * 60_000 };
    return token;
  } catch (err) {
    if (err instanceof CalendarError) throw err;
    const code = (err as { code?: string }).code ?? '';
    const messages: Record<string, [string, CalendarError['kind']]> = {
      'auth/popup-closed-by-user': ['已取消授權', 'cancelled'],
      'auth/cancelled-popup-request': ['已取消授權', 'cancelled'],
      'auth/popup-blocked': ['瀏覽器擋住了 Google 授權視窗，請允許彈出視窗後再試', 'other'],
      'auth/user-mismatch': [`請選擇與登入相同的 Google 帳號（${email}）`, 'other'],
      'auth/network-request-failed': ['網路連線失敗', 'other'],
    };
    const [message, kind] = messages[code] ?? [err instanceof Error ? err.message : '無法取得 Google 日曆授權', 'other'];
    throw new CalendarError(message, kind);
  }
}

export function forgetCalendarAccess(): void {
  cached = null;
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(`${EVENTS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : null,
  });
  if (res.ok) return res.status === 204 ? null : ((await res.json()) as T);

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
  };
  const reasons = [...(data.error?.errors ?? []), ...(data.error?.details ?? [])].map((e) => e.reason ?? '');
  if (res.status === 401) {
    forgetCalendarAccess();
    throw new CalendarError('Google 日曆授權已過期，請再按一次', 'auth', res.status);
  }
  if (reasons.includes('accessNotConfigured') || reasons.includes('SERVICE_DISABLED')) {
    throw new CalendarError('系統尚未啟用 Google Calendar API，請聯絡系統管理員', 'setup', res.status);
  }
  if (reasons.includes('insufficientPermissions') || reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    // Google's consent screen lets people untick the calendar permission.
    forgetCalendarAccess();
    throw new CalendarError('未授權管理日曆：請再按一次，並在 Google 視窗中勾選日曆權限', 'scope', res.status);
  }
  throw new CalendarError(data.error?.message ?? `Google 日曆錯誤 ${res.status}`, 'other', res.status);
}

const statusOf = (err: unknown) => (err instanceof CalendarError ? err.status : 0);

interface ListResponse {
  items?: { id: string }[];
  nextPageToken?: string;
}

async function existingIds(token: string, scheduleId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken = '';
  do {
    const q = new URLSearchParams({
      privateExtendedProperty: `${GOOGLE_SCHEDULE_PROPERTY}=${scheduleId}`,
      maxResults: '250',
      fields: 'items(id),nextPageToken',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await call<ListResponse>(token, 'GET', `?${q.toString()}`);
    page?.items?.forEach((e) => ids.add(e.id));
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);
  return ids;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Make the user's calendar match `events` for this schedule: add new shifts, update
 * changed ones and remove events for days that are no longer worked.
 */
export async function syncScheduleToGoogle(
  token: string,
  scheduleId: string,
  events: ShiftEvent[],
  opts: { portalUrl?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<SyncResult> {
  const existing = await existingIds(token, scheduleId);
  const wanted = new Set(events.map((e) => e.id));
  const result: SyncResult = { added: 0, updated: 0, removed: 0 };

  const tasks: (() => Promise<void>)[] = [
    ...events.map((event) => async () => {
      const body = googleEventBody(event, scheduleId, opts.portalUrl);
      const id = encodeURIComponent(event.id);
      if (existing.has(event.id)) {
        await call(token, 'PATCH', `/${id}`, body);
        result.updated++;
        return;
      }
      try {
        await call(token, 'POST', '', body);
        result.added++;
      } catch (err) {
        // 409: the id exists but was not listed – e.g. the user deleted the event. Revive it.
        if (statusOf(err) !== 409) throw err;
        await call(token, 'PATCH', `/${id}`, body);
        result.added++;
      }
    }),
    ...[...existing]
      .filter((id) => !wanted.has(id))
      .map((id) => async () => {
        try {
          await call(token, 'DELETE', `/${encodeURIComponent(id)}`);
          result.removed++;
        } catch (err) {
          if (statusOf(err) !== 404 && statusOf(err) !== 410) throw err;
        }
      }),
  ];

  // A few requests at a time stays well inside the Calendar API per-user rate limit.
  let next = 0;
  let done = 0;
  opts.onProgress?.(0, tasks.length);
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++]!;
      await task();
      opts.onProgress?.(++done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
  return result;
}
