/**
 * Copy song MP3s that still point at MusicGPT into Firebase Storage.
 * Songs are visited oldest createdAt first. Dry-run probes and writes nothing.
 * Apply never deletes an object or a document. A file MusicGPT no longer
 * serves keeps its current URL and is marked audioExpired.
 */

import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { COLLECTIONS } from '@/lib/firebase/collections';
import {
  audioPointsAtMusicGpt,
  type AudioProbeClass,
} from '@/lib/server/songAudioUrl';
import {
  persistConversionAudio,
  probeRemoteAudio,
  type SongAudioBucket,
} from '@/lib/server/songAudioStorage';

export type AudioDocRef = {
  update(data: Record<string, unknown>): Promise<unknown>;
  set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<unknown>;
};

export type AudioDocSnap = {
  id: string;
  ref: AudioDocRef;
  data(): Record<string, unknown> | undefined;
};

export type AudioQuery = {
  orderBy(field: string, direction?: 'asc' | 'desc'): AudioQuery;
  limit(n: number): AudioQuery;
  startAfter(cursor: AudioDocSnap): AudioQuery;
  where(field: string, op: string, value: unknown): AudioQuery;
  get(): Promise<{ empty: boolean; size: number; docs: AudioDocSnap[] }>;
};

export type AudioBackfillDb = {
  collection(name: string): AudioQuery & {
    doc(id: string): AudioDocRef;
  };
};

export type UnfetchableAudioRow = {
  songId: string;
  versionId: string;
  generationId: string;
  url: string;
  createdAt: string;
  status: number;
  reason: 'not_found' | 'forbidden' | 'other';
};

export type BackfillSongAudioSummary = {
  songsScanned: number;
  stillOnMusicGpt: number;
  fetchable: number;
  unfetchable: number;
  unfetchableNotFound: number;
  unfetchableForbidden: number;
  unfetchableOther: number;
  migrated: number;
  failed: number;
  dryRun: boolean;
  logJsonPath: string;
  logCsvPath: string;
};

type FieldKind = 'version' | 'generation';

type AudioField = {
  kind: FieldKind;
  ref: AudioDocRef;
  versionId: string;
  generationId: string;
  conversionId: string;
  data: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function createdAtIso(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const stamp = value as { toDate?: () => Date; toMillis?: () => number };
  try {
    if (typeof stamp.toDate === 'function') return stamp.toDate().toISOString();
  } catch {
    // Fall through to millis.
  }
  if (typeof stamp.toMillis === 'function') {
    const ms = stamp.toMillis();
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return '';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}

function conversionIdFromGeneration(data: Record<string, unknown>, url: string): string {
  const output = asRecord(data.output);
  const metadata = asRecord(output?.metadata);
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith('conversion_')) continue;
      const entry = asRecord(value);
      if (typeof entry?.conversion_path === 'string' && entry.conversion_path === url) {
        return key.slice('conversion_'.length);
      }
    }
  }
  const processed = stringList(data.providerProcessedConversions);
  const ids = processed.length > 0 ? processed : stringList(data.providerConversionIds);
  return ids.length === 1 ? ids[0] : '';
}

function versionFields(docs: AudioDocSnap[], bucketName: string): AudioField[] {
  const fields: AudioField[] = [];
  for (const doc of docs) {
    const data = doc.data() ?? {};
    const url = typeof data.audioURL === 'string' ? data.audioURL.trim() : '';
    if (!audioPointsAtMusicGpt(url, bucketName)) continue;
    const providerOutputId =
      typeof data.providerOutputId === 'string' ? data.providerOutputId.trim() : '';
    fields.push({
      kind: 'version',
      ref: doc.ref,
      versionId: doc.id,
      generationId: '',
      conversionId: providerOutputId || doc.id,
      data,
    });
  }
  return fields;
}

function generationFields(docs: AudioDocSnap[], bucketName: string): AudioField[] {
  const fields: AudioField[] = [];
  for (const doc of docs) {
    const data = doc.data() ?? {};
    const output = asRecord(data.output);
    const url = typeof output?.audioURL === 'string' ? output.audioURL.trim() : '';
    if (!audioPointsAtMusicGpt(url, bucketName)) continue;
    fields.push({
      kind: 'generation',
      ref: doc.ref,
      versionId: '',
      generationId: doc.id,
      conversionId: conversionIdFromGeneration(data, url),
      data,
    });
  }
  return fields;
}

function groupByUrl(fields: AudioField[]): Map<string, AudioField[]> {
  const groups = new Map<string, AudioField[]>();
  for (const field of fields) {
    const url =
      field.kind === 'version'
        ? String(field.data.audioURL).trim()
        : String(asRecord(field.data.output)?.audioURL ?? '').trim();
    const list = groups.get(url) ?? [];
    list.push(field);
    groups.set(url, list);
  }
  return groups;
}

function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeUnfetchableLog(
  logDir: string,
  projectLabel: string,
  rows: UnfetchableAudioRow[]
): { jsonPath: string; csvPath: string } {
  mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(logDir, `song-audio-unfetchable-${projectLabel}-${stamp}`);
  const jsonPath = `${base}.json`;
  const csvPath = `${base}.csv`;
  writeFileSync(jsonPath, `${JSON.stringify(rows, null, 2)}\n`);
  const header = 'songId,versionId,generationId,url,createdAt,status,reason';
  const lines = rows.map((row) =>
    [
      row.songId,
      row.versionId,
      row.generationId,
      row.url,
      row.createdAt,
      row.status,
      row.reason,
    ]
      .map(csvField)
      .join(',')
  );
  writeFileSync(csvPath, `${[header, ...lines].join('\n')}\n`);
  return { jsonPath, csvPath };
}

async function writeMigrated(field: AudioField, sourceUrl: string, storedUrl: string): Promise<void> {
  if (field.kind === 'version') {
    await field.ref.update({
      audioURL: storedUrl,
      musicgptAudioUrl: sourceUrl,
      audioPersisted: true,
      audioExpired: false,
    });
    return;
  }
  const output = asRecord(field.data.output) ?? {};
  const metadata = asRecord(output.metadata) ?? {};
  await field.ref.update({
    output: {
      ...output,
      audioURL: storedUrl,
      metadata: {
        ...metadata,
        musicgptAudioUrl: sourceUrl,
        audioPersisted: true,
        audioExpired: false,
      },
    },
  });
}

async function writeExpired(field: AudioField, sourceUrl: string): Promise<void> {
  if (field.kind === 'version') {
    await field.ref.update({
      musicgptAudioUrl: sourceUrl,
      audioPersisted: false,
      audioExpired: true,
    });
    return;
  }
  const output = asRecord(field.data.output) ?? {};
  const metadata = asRecord(output.metadata) ?? {};
  await field.ref.update({
    output: {
      ...output,
      metadata: {
        ...metadata,
        musicgptAudioUrl: sourceUrl,
        audioPersisted: false,
        audioExpired: true,
      },
    },
  });
}

function conversionIdForGroup(songId: string, url: string, group: AudioField[]): string {
  const found = group.find((field) => field.conversionId)?.conversionId;
  if (found) return found;
  const digest = createHash('sha256').update(`${songId}\n${url}`).digest('hex').slice(0, 32);
  return `url-${digest}`;
}

function unfetchableReason(reason: AudioProbeClass): UnfetchableAudioRow['reason'] | null {
  if (reason === 'not_found' || reason === 'forbidden' || reason === 'other') return reason;
  return null;
}

export async function backfillSongAudio(input: {
  db: AudioBackfillDb;
  bucket: SongAudioBucket;
  dryRun: boolean;
  limit: number | null;
  projectLabel: string;
  logDir: string;
  fetchImpl?: typeof fetch;
  pageSize?: number;
}): Promise<BackfillSongAudioSummary> {
  const pageSize = input.pageSize ?? 100;
  const bucketName = input.bucket.name;
  const rows: UnfetchableAudioRow[] = [];
  const summary: BackfillSongAudioSummary = {
    songsScanned: 0,
    stillOnMusicGpt: 0,
    fetchable: 0,
    unfetchable: 0,
    unfetchableNotFound: 0,
    unfetchableForbidden: 0,
    unfetchableOther: 0,
    migrated: 0,
    failed: 0,
    dryRun: input.dryRun,
    logJsonPath: '',
    logCsvPath: '',
  };

  let cursor: AudioDocSnap | null = null;
  let processedSongs = 0;

  for (;;) {
    let query = input.db.collection(COLLECTIONS.songs).orderBy('createdAt', 'asc').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty || page.docs.length === 0) break;

    for (const song of page.docs) {
      cursor = song;
      summary.songsScanned += 1;
      const createdAt = createdAtIso((song.data() ?? {}).createdAt);

      let versionSnap;
      let generationSnap;
      try {
        versionSnap = await input.db
          .collection(COLLECTIONS.songVersions)
          .where('songId', '==', song.id)
          .get();
        generationSnap = await input.db
          .collection(COLLECTIONS.generations)
          .where('songId', '==', song.id)
          .get();
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`song_audio_backfill_failed song=${song.id} ${message}`);
        continue;
      }

      const fields = [
        ...versionFields(versionSnap.docs, bucketName),
        ...generationFields(generationSnap.docs, bucketName),
      ];
      const groups = groupByUrl(fields);
      if (groups.size === 0) continue;

      processedSongs += 1;
      summary.stillOnMusicGpt += groups.size;

      for (const [url, group] of groups) {
        const conversionId = conversionIdForGroup(song.id, url, group);
        try {
          if (input.dryRun) {
            const probe = await probeRemoteAudio(url, input.fetchImpl);
            recordProbe(summary, rows, {
              songId: song.id,
              createdAt,
              url,
              group,
              httpStatus: probe.httpStatus,
              reason: probe.reason,
            });
            continue;
          }

          const copied = await persistConversionAudio({
            songId: song.id,
            conversionId,
            sourceUrl: url,
            bucket: input.bucket,
            fetchImpl: input.fetchImpl,
          });
          if (copied.audioPersisted) {
            for (const field of group) {
              await writeMigrated(field, url, copied.audioURL);
            }
            summary.fetchable += 1;
            summary.migrated += 1;
            continue;
          }
          const recorded = recordProbe(summary, rows, {
            songId: song.id,
            createdAt,
            url,
            group,
            httpStatus: copied.httpStatus,
            reason: copied.reason,
          });
          if (recorded) {
            for (const field of group) {
              await writeExpired(field, url);
            }
          }
        } catch (error) {
          summary.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`song_audio_backfill_failed song=${song.id} host=${hostOf(url)} ${message}`);
        }
      }

      if (input.limit != null && processedSongs >= input.limit) {
        const logs = writeUnfetchableLog(input.logDir, input.projectLabel, rows);
        summary.logJsonPath = logs.jsonPath;
        summary.logCsvPath = logs.csvPath;
        return summary;
      }
    }

    if (page.docs.length < pageSize) break;
  }

  const logs = writeUnfetchableLog(input.logDir, input.projectLabel, rows);
  summary.logJsonPath = logs.jsonPath;
  summary.logCsvPath = logs.csvPath;
  return summary;
}

function recordProbe(
  summary: BackfillSongAudioSummary,
  rows: UnfetchableAudioRow[],
  input: {
    songId: string;
    createdAt: string;
    url: string;
    group: AudioField[];
    httpStatus: number;
    reason: AudioProbeClass;
  }
): boolean {
  if (input.reason === 'ok') {
    summary.fetchable += 1;
    return false;
  }
  const reason = unfetchableReason(input.reason);
  if (!reason) {
    summary.failed += 1;
    console.error(
      `song_audio_backfill_failed song=${input.songId} status=${input.httpStatus} reason=${input.reason} host=${hostOf(input.url)}`
    );
    return false;
  }
  summary.unfetchable += 1;
  if (reason === 'not_found') summary.unfetchableNotFound += 1;
  else if (reason === 'forbidden') summary.unfetchableForbidden += 1;
  else summary.unfetchableOther += 1;
  rows.push({
    songId: input.songId,
    versionId: input.group
      .map((field) => field.versionId)
      .filter(Boolean)
      .join(','),
    generationId: input.group
      .map((field) => field.generationId)
      .filter(Boolean)
      .join(','),
    url: input.url,
    createdAt: input.createdAt,
    status: input.httpStatus,
    reason,
  });
  console.error(
    `song_audio_unfetchable song=${input.songId} status=${input.httpStatus} reason=${reason} host=${hostOf(input.url)}`
  );
  return true;
}

export function formatBackfillSummary(summary: BackfillSongAudioSummary): string {
  return [
    `total songs scanned: ${summary.songsScanned}`,
    `still on MusicGPT URLs: ${summary.stillOnMusicGpt}`,
    `fetchable: ${summary.fetchable}`,
    `expired/unfetchable: ${summary.unfetchable} (404/410: ${summary.unfetchableNotFound}, 401/403: ${summary.unfetchableForbidden}, other: ${summary.unfetchableOther})`,
    `migrated: ${summary.migrated}`,
    `failed: ${summary.failed}`,
    `unfetchable log: ${summary.logJsonPath}`,
    `unfetchable csv: ${summary.logCsvPath}`,
  ].join('\n');
}
