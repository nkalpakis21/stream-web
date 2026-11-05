import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { POST } from '../app/api/reports/route';
import { setAdminDbForTests } from '../lib/firebase/admin';
import { BLOCKED_UIDS_MAX, COLLECTIONS } from '../lib/firebase/collections';
import { SUPPORT_EMAIL } from '../lib/brand/site';
import { HttpError } from '../lib/server/auth';
import {
  REPORT_NOTE_MAX_CHARS,
  REPORT_REASONS,
  REPORT_WINDOW_MS,
  REPORTS_ALERT_EMAIL_ENABLED_ENV,
  REPORTS_PER_USER_PER_HOUR,
  createContentReport,
  evaluateReportLimit,
  parseReportRequest,
  reportsAlertEmailEnabled,
  sendReportAlert,
  setReportAuthForTests,
} from '../lib/server/reports';

const UID = 'reporter-1';
const NOW = 1_700_000_000_000;

type DocData = Record<string, unknown>;

function createMemoryAdminDb() {
  const tables = new Map<string, Map<string, DocData>>();
  let seq = 0;

  function rows(name: string): Map<string, DocData> {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  }

  function docRef(name: string, id: string) {
    const ref = {
      id,
      async get() {
        const data = rows(name).get(id);
        return {
          id,
          exists: data !== undefined,
          data: () => (data ? { ...data } : undefined),
          get(field: string) {
            return data ? data[field] : undefined;
          },
          ref,
        };
      },
      async set(data: DocData) {
        rows(name).set(id, { ...data });
      },
    };
    return ref;
  }

  return {
    db: {
      collection(name: string) {
        return {
          doc(id?: string) {
            return docRef(name, id ?? `auto-${++seq}`);
          },
        };
      },
      async runTransaction<T>(fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { set: (data: DocData) => Promise<void> }, data: DocData) => void;
      }) => Promise<T>): Promise<T> {
        const pending: Array<() => Promise<void>> = [];
        const result = await fn({
          get(ref) {
            return ref.get();
          },
          set(ref, data) {
            pending.push(() => ref.set(data));
          },
        });
        for (const write of pending) await write();
        return result;
      },
    },
    list(name: string) {
      return [...rows(name).entries()].map(([id, data]) => ({ id, data: { ...data } }));
    },
    async seed(name: string, id: string, data: DocData) {
      await docRef(name, id).set(data);
    },
  };
}

function postReport(body: unknown, authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new NextRequest('https://streamstar.xyz/api/reports', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function songReport(overrides: Record<string, unknown> = {}) {
  return {
    targetType: 'song',
    targetId: 'song-1',
    reason: 'spam_scam',
    ...overrides,
  };
}

afterEach(() => {
  setReportAuthForTests(null);
  setAdminDbForTests(null);
  delete process.env[REPORTS_ALERT_EMAIL_ENABLED_ENV];
});

describe('block list cap', () => {
  it('matches the rules cap of 500', () => {
    assert.equal(BLOCKED_UIDS_MAX, 500);
  });
});

describe('parseReportRequest', () => {
  it('accepts the six design reasons and a trimmed note', () => {
    for (const reason of REPORT_REASONS) {
      const parsed = parseReportRequest({
        targetType: 'artist',
        targetId: '  artist-1  ',
        reason,
        note: '  looks wrong  ',
      });
      assert.equal(parsed.reason, reason);
      assert.equal(parsed.targetId, 'artist-1');
      assert.equal(parsed.note, 'looks wrong');
    }
  });

  it('rejects user targets, unknown reasons, and a note over 500 characters', () => {
    assert.throws(
      () => parseReportRequest({ targetType: 'user', targetId: 'u1', reason: 'other' }),
      (error: unknown) => error instanceof HttpError && error.status === 400
    );
    assert.throws(
      () => parseReportRequest({ targetType: 'song', targetId: 's1', reason: 'spam' }),
      (error: unknown) => error instanceof HttpError && error.status === 400
    );
    assert.throws(
      () =>
        parseReportRequest({
          targetType: 'comment',
          songId: 'song-1',
          commentId: 'c1',
          reason: 'other',
          note: 'x'.repeat(REPORT_NOTE_MAX_CHARS + 1),
        }),
      (error: unknown) => error instanceof HttpError && error.status === 400
    );
    assert.throws(
      () => parseReportRequest({ targetType: 'comment', commentId: 'c1', reason: 'other' }),
      (error: unknown) => error instanceof HttpError && error.status === 400
    );
    assert.throws(
      () =>
        parseReportRequest({
          targetType: 'comment',
          songId: 'song-1',
          commentId: 'c1',
          targetId: 'other',
          reason: 'other',
        }),
      (error: unknown) => error instanceof HttpError && error.status === 400
    );
  });

  it('omits a blank note and keeps a 500-character note', () => {
    const blank = parseReportRequest({
      targetType: 'song',
      targetId: 'song-1',
      reason: 'other',
      note: '   ',
    });
    assert.equal(blank.note, undefined);
    const full = parseReportRequest({
      targetType: 'song',
      targetId: 'song-1',
      reason: 'sexual',
      note: 'x'.repeat(REPORT_NOTE_MAX_CHARS),
    });
    assert.equal(full.note?.length, REPORT_NOTE_MAX_CHARS);
  });
});

describe('evaluateReportLimit', () => {
  it('allows 20 reports in the hour and resets after the window', () => {
    let start: number | null = null;
    let count = 0;
    for (let n = 0; n < REPORTS_PER_USER_PER_HOUR; n += 1) {
      const decision = evaluateReportLimit({ nowMs: NOW, windowStartMs: start, count });
      assert.equal(decision.allowed, true);
      start = decision.windowStartMs;
      count = decision.count;
    }
    assert.equal(count, REPORTS_PER_USER_PER_HOUR);
    const blocked = evaluateReportLimit({ nowMs: NOW + 1, windowStartMs: start, count });
    assert.equal(blocked.allowed, false);
    const reset = evaluateReportLimit({
      nowMs: NOW + REPORT_WINDOW_MS,
      windowStartMs: start,
      count,
    });
    assert.equal(reset.allowed, true);
    assert.equal(reset.count, 1);
    assert.equal(reset.windowStartMs, NOW + REPORT_WINDOW_MS);
  });
});

describe('sendReportAlert', () => {
  it('stays a no-op until REPORTS_ALERT_EMAIL_ENABLED=true, and still does not send mail', () => {
    assert.equal(reportsAlertEmailEnabled(), false);
    const lines: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args);
    };
    try {
      sendReportAlert({
        id: 'r1',
        reporterUid: UID,
        targetType: 'song',
        targetId: 'song-1',
        reason: 'other',
      });
      assert.equal(lines.length, 0);

      process.env[REPORTS_ALERT_EMAIL_ENABLED_ENV] = '1';
      assert.equal(reportsAlertEmailEnabled(), false);
      sendReportAlert({
        id: 'r1',
        reporterUid: UID,
        targetType: 'song',
        targetId: 'song-1',
        reason: 'other',
      });
      assert.equal(lines.length, 0);

      process.env[REPORTS_ALERT_EMAIL_ENABLED_ENV] = 'true';
      sendReportAlert({
        id: 'r1',
        reporterUid: UID,
        targetType: 'comment',
        targetId: 'comment-1',
        reason: 'hate_harassment',
        songId: 'song-1',
        targetOwnerId: 'author-1',
      });
      assert.equal(lines.length, 1);
      assert.equal(lines[0][0], '[reports] alert requested; no email provider is configured');
      const payload = lines[0][1] as { to?: string; note?: string };
      assert.equal(payload.to, SUPPORT_EMAIL);
      assert.equal(Object.hasOwn(payload, 'note'), false);
    } finally {
      console.info = original;
    }
  });
});

describe('POST /api/reports', () => {
  it('returns 401 when the bearer token is missing', async () => {
    const response = await POST(postReport(songReport()));
    assert.equal(response.status, 401);
  });

  it('returns 400 for invalid JSON and an unknown reason', async () => {
    const memory = createMemoryAdminDb();
    setAdminDbForTests(memory.db);
    setReportAuthForTests(async () => ({ uid: UID }));

    const invalid = await POST(postReport('{', `Bearer token-1`));
    assert.equal(invalid.status, 400);

    const reason = await POST(postReport(songReport({ reason: 'hate' }), 'Bearer token-1'));
    assert.equal(reason.status, 400);
    assert.equal(memory.list(COLLECTIONS.reports).length, 0);
  });

  it('stores a song report for the token uid and resolves ownerId', async () => {
    const memory = createMemoryAdminDb();
    await memory.seed(COLLECTIONS.songs, 'song-1', { ownerId: 'owner-1', title: 'First Light' });
    setAdminDbForTests(memory.db);
    setReportAuthForTests(async (token) => {
      assert.equal(token, 'token-1');
      return { uid: UID };
    });

    const response = await POST(
      postReport(
        songReport({ reporterUid: 'someone-else', note: ' spam ' }),
        'Bearer token-1'
      )
    );
    assert.equal(response.status, 201);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const body = (await response.json()) as { id: string };
    const stored = memory.list(COLLECTIONS.reports);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, body.id);
    assert.equal(stored[0].data.reporterUid, UID);
    assert.equal(stored[0].data.targetType, 'song');
    assert.equal(stored[0].data.targetId, 'song-1');
    assert.equal(stored[0].data.reason, 'spam_scam');
    assert.equal(stored[0].data.note, 'spam');
    assert.equal(stored[0].data.status, 'open');
    assert.equal(stored[0].data.targetOwnerId, 'owner-1');
    assert.equal(Object.hasOwn(stored[0].data, 'songId'), false);
    assert.equal(Object.hasOwn(stored[0].data, 'title'), false);
    assert.ok(stored[0].data.createdAt);
  });

  it('stores a comment report with the song id and the author uid', async () => {
    const memory = createMemoryAdminDb();
    await memory.seed(COLLECTIONS.comments, 'comment-1', {
      authorId: 'author-9',
      targetType: 'song',
      targetId: 'song-9',
      content: 'do not copy this',
      deletedAt: null,
    });
    setAdminDbForTests(memory.db);
    setReportAuthForTests(async () => ({ uid: UID }));

    const response = await POST(
      postReport(
        {
          targetType: 'comment',
          songId: 'song-9',
          commentId: 'comment-1',
          reason: 'violence_self_harm',
        },
        'Bearer token-1'
      )
    );
    assert.equal(response.status, 201);
    const stored = memory.list(COLLECTIONS.reports)[0];
    assert.equal(stored.data.targetId, 'comment-1');
    assert.equal(stored.data.songId, 'song-9');
    assert.equal(stored.data.targetOwnerId, 'author-9');
    assert.equal(Object.hasOwn(stored.data, 'content'), false);
  });

  it('returns 404 when the comment is not on that song and does not count the attempt', async () => {
    const memory = createMemoryAdminDb();
    await memory.seed(COLLECTIONS.comments, 'comment-2', {
      authorId: 'author-2',
      targetType: 'artist',
      targetId: 'artist-2',
      deletedAt: null,
    });
    await memory.seed(COLLECTIONS.comments, 'comment-3', {
      authorId: 'author-3',
      targetType: 'song',
      targetId: 'song-other',
      deletedAt: null,
    });
    await memory.seed(COLLECTIONS.comments, 'comment-4', {
      authorId: 'author-4',
      targetType: 'song',
      targetId: 'song-9',
      deleted: true,
    });
    setAdminDbForTests(memory.db);
    setReportAuthForTests(async () => ({ uid: UID }));

    for (const body of [
      { targetType: 'comment', songId: 'song-9', commentId: 'missing', reason: 'other' },
      { targetType: 'comment', songId: 'song-9', commentId: 'comment-2', reason: 'other' },
      { targetType: 'comment', songId: 'song-9', commentId: 'comment-3', reason: 'other' },
      { targetType: 'comment', songId: 'song-9', commentId: 'comment-4', reason: 'other' },
    ]) {
      const response = await POST(postReport(body, 'Bearer token-1'));
      assert.equal(response.status, 404);
    }
    assert.equal(memory.list(COLLECTIONS.reports).length, 0);
    assert.equal(memory.list(COLLECTIONS.reportRateLimits).length, 0);
  });

  it('returns 404 when the song or artist does not exist and does not count the attempt', async () => {
    const memory = createMemoryAdminDb();
    await memory.seed(COLLECTIONS.songs, 'gone', { ownerId: 'owner-1', deletedAt: { seconds: 1 } });
    setAdminDbForTests(memory.db);
    setReportAuthForTests(async () => ({ uid: UID }));
    const missing = await POST(
      postReport({ targetType: 'artist', targetId: 'missing', reason: 'other' }, 'Bearer token-1')
    );
    assert.equal(missing.status, 404);
    const deleted = await POST(
      postReport({ targetType: 'song', targetId: 'gone', reason: 'other' }, 'Bearer token-1')
    );
    assert.equal(deleted.status, 404);
    assert.equal(memory.list(COLLECTIONS.reports).length, 0);
    assert.equal(memory.list(COLLECTIONS.reportRateLimits).length, 0);
  });

  it('rejects the 21st report in the hour and allows one after the window', async () => {
    const memory = createMemoryAdminDb();
    setAdminDbForTests(memory.db);
    await memory.seed(COLLECTIONS.songs, 'song-1', { ownerId: 'owner-1' });
    const input = {
      targetType: 'song' as const,
      targetId: 'song-1',
      reason: 'other' as const,
    };
    for (let n = 0; n < REPORTS_PER_USER_PER_HOUR; n += 1) {
      await createContentReport(UID, input, NOW);
    }
    await assert.rejects(
      () => createContentReport(UID, input, NOW + 1),
      (error: unknown) => error instanceof HttpError && error.status === 429
    );
    assert.equal(memory.list(COLLECTIONS.reports).length, REPORTS_PER_USER_PER_HOUR);
    const limit = memory.list(COLLECTIONS.reportRateLimits);
    assert.equal(limit.length, 1);
    assert.equal(limit[0].id, UID);
    assert.equal(limit[0].data.count, REPORTS_PER_USER_PER_HOUR);
    assert.equal(
      (limit[0].data.windowStart as Timestamp).toMillis(),
      NOW
    );

    const id = await createContentReport(UID, input, NOW + REPORT_WINDOW_MS);
    assert.equal(typeof id, 'string');
    assert.equal(memory.list(COLLECTIONS.reports).length, REPORTS_PER_USER_PER_HOUR + 1);
    assert.equal(memory.list(COLLECTIONS.reportRateLimits)[0].data.count, 1);
  });
});
