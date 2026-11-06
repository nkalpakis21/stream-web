import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { SUPPORT_EMAIL } from '@/lib/brand/site';
import { getAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { HttpError } from '@/lib/api/requireAuth';

export const REPORT_TARGET_TYPES = ['song', 'artist', 'comment'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** Design's report reasons. Do not rename; the iOS sheet uses these values. */
export const REPORT_REASONS = [
  'sexual',
  'hate_harassment',
  'violence_self_harm',
  'copyright_impersonation',
  'spam_scam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_NOTE_MAX_CHARS = 500;
export const REPORT_TARGET_ID_MAX_CHARS = 128;
export const REPORTS_PER_USER_PER_HOUR = 20;
export const REPORT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Gate for the report alert. This repo has no email provider (the support
 * page is a mailto link to SUPPORT_EMAIL). Unset, or any value other than
 * the string "true", skips the alert. "true" still does not send mail; it
 * only writes a server log addressed to SUPPORT_EMAIL.
 */
export const REPORTS_ALERT_EMAIL_ENABLED_ENV = 'REPORTS_ALERT_EMAIL_ENABLED';

const TARGET_TYPES = new Set<string>(REPORT_TARGET_TYPES);
const REASONS = new Set<string>(REPORT_REASONS);

export type ReportInput = {
  targetType: ReportTargetType;
  /** Song id, artist id, or comment id. */
  targetId: string;
  reason: ReportReason;
  note?: string;
  /** Present only for a comment. The comment must belong to this song. */
  songId?: string;
};

function readId(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`);
  }
  const id = value.trim();
  if (!id || id.length > REPORT_TARGET_ID_MAX_CHARS || id.includes('/')) {
    throw new HttpError(400, `${field} is invalid`);
  }
  return id;
}

export function parseReportRequest(body: unknown): ReportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid report');
  }
  const record = body as Record<string, unknown>;

  if (typeof record.targetType !== 'string' || !TARGET_TYPES.has(record.targetType)) {
    throw new HttpError(400, 'targetType must be song, artist, or comment');
  }
  const targetType = record.targetType as ReportTargetType;
  if (typeof record.reason !== 'string' || !REASONS.has(record.reason)) {
    throw new HttpError(400, 'reason is invalid');
  }

  let note: string | undefined;
  if (record.note != null) {
    if (typeof record.note !== 'string') {
      throw new HttpError(400, 'note must be a string');
    }
    if (record.note.length > REPORT_NOTE_MAX_CHARS) {
      throw new HttpError(400, 'note must be at most 500 characters');
    }
    const trimmed = record.note.trim();
    if (trimmed) note = trimmed;
  }

  const reason = record.reason as ReportReason;
  if (targetType === 'comment') {
    const songId = readId(record.songId, 'songId');
    const commentId = readId(record.commentId, 'commentId');
    if (record.targetId != null && readId(record.targetId, 'targetId') !== commentId) {
      throw new HttpError(400, 'targetId does not match commentId');
    }
    return {
      targetType,
      targetId: commentId,
      songId,
      reason,
      ...(note ? { note } : {}),
    };
  }

  return {
    targetType,
    targetId: readId(record.targetId, 'targetId'),
    reason,
    ...(note ? { note } : {}),
  };
}

export function evaluateReportLimit(input: {
  nowMs: number;
  windowStartMs: number | null;
  count: number;
}): { allowed: boolean; windowStartMs: number; count: number } {
  const stored = Number.isFinite(input.count) && input.count > 0 ? input.count : 0;
  const expired =
    input.windowStartMs == null || input.nowMs - input.windowStartMs >= REPORT_WINDOW_MS;
  const windowStartMs =
    expired || input.windowStartMs == null ? input.nowMs : input.windowStartMs;
  const count = expired ? 0 : stored;
  if (count >= REPORTS_PER_USER_PER_HOUR) {
    return { allowed: false, windowStartMs, count };
  }
  return { allowed: true, windowStartMs, count: count + 1 };
}

export function reportsAlertEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[REPORTS_ALERT_EMAIL_ENABLED_ENV] === 'true';
}

type ReportAuth = (idToken: string) => Promise<{ uid: string }>;

let reportAuthForTests: ReportAuth | null = null;

/** Test-only. Production requests always use Firebase Admin verifyIdToken. */
export function setReportAuthForTests(verify: ReportAuth | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setReportAuthForTests is disabled in production');
  }
  reportAuthForTests = verify;
}

export function reportAuthVerifier(): ReportAuth | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return reportAuthForTests ?? undefined;
}

export type ReportAlert = {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  targetOwnerId?: string;
  songId?: string;
};

/**
 * No-op unless REPORTS_ALERT_EMAIL_ENABLED=true.
 * There is no mail transport in this repo, so the enabled path logs the
 * alert for SUPPORT_EMAIL and does not send email. The note is omitted.
 */
export function sendReportAlert(report: ReportAlert): void {
  if (!reportsAlertEmailEnabled()) return;
  console.info('[reports] alert requested; no email provider is configured', {
    id: report.id,
    reporterUid: report.reporterUid,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    targetOwnerId: report.targetOwnerId ?? null,
    songId: report.songId ?? null,
    to: SUPPORT_EMAIL,
  });
}

type LocatedTarget = {
  targetOwnerId?: string;
  songId?: string;
};

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isDeleted(data: Record<string, unknown> | undefined): boolean {
  if (!data) return true;
  if (data.deleted === true) return true;
  return data.deletedAt != null;
}

async function locateTarget(db: Firestore, input: ReportInput): Promise<LocatedTarget> {
  if (input.targetType === 'song' || input.targetType === 'artist') {
    const name = input.targetType === 'song' ? COLLECTIONS.songs : COLLECTIONS.artists;
    const snap = await db.collection(name).doc(input.targetId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    if (!snap.exists || isDeleted(data)) {
      throw new HttpError(404, 'Not found');
    }
    const targetOwnerId = nonEmptyString(data?.ownerId);
    return targetOwnerId ? { targetOwnerId } : {};
  }

  const songId = input.songId;
  if (!songId) throw new HttpError(400, 'songId is required');
  const snap = await db.collection(COLLECTIONS.comments).doc(input.targetId).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  if (!snap.exists || isDeleted(data)) {
    throw new HttpError(404, 'Not found');
  }
  if (data?.targetType !== 'song' || data.targetId !== songId) {
    throw new HttpError(404, 'Not found');
  }
  const authorId = nonEmptyString(data.authorId);
  if (!authorId) throw new HttpError(404, 'Not found');
  return { targetOwnerId: authorId, songId };
}

function millisOf(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { toMillis?: () => number };
  if (typeof candidate.toMillis !== 'function') return null;
  const ms = candidate.toMillis();
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

/**
 * Writes reports/{id} and increments the reporter's hourly counter.
 * A missing song, artist, or comment is 404 and does not use a rate-limit slot.
 * A comment report stores songId and the author's uid as targetOwnerId.
 */
export async function createContentReport(
  reporterUid: string,
  input: ReportInput,
  nowMs: number = Date.now()
): Promise<string> {
  const db = getAdminDb();
  const located = await locateTarget(db, input);
  const reportRef = db.collection(COLLECTIONS.reports).doc();
  const limitRef = db.collection(COLLECTIONS.reportRateLimits).doc(reporterUid);

  await db.runTransaction(async (tx) => {
    const limitSnap = await tx.get(limitRef);
    const decision = evaluateReportLimit({
      nowMs,
      windowStartMs: limitSnap.exists ? millisOf(limitSnap.get('windowStart')) : null,
      count: limitSnap.exists ? Number(limitSnap.get('count') ?? 0) : 0,
    });
    if (!decision.allowed) {
      throw new HttpError(429, 'Too many reports. Try again later.');
    }

    const report: Record<string, unknown> = {
      reporterUid,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
      status: 'open',
    };
    if (input.note) report.note = input.note;
    if (located.targetOwnerId) report.targetOwnerId = located.targetOwnerId;
    if (located.songId) report.songId = located.songId;

    tx.set(reportRef, report);
    tx.set(limitRef, {
      windowStart: Timestamp.fromMillis(decision.windowStartMs),
      count: decision.count,
    });
  });

  try {
    sendReportAlert({
      id: reportRef.id,
      reporterUid,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      targetOwnerId: located.targetOwnerId,
      songId: located.songId,
    });
  } catch (error) {
    console.error('[reports] alert failed', error);
  }

  return reportRef.id;
}
