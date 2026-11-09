/**
 * Read-only counts of funnelEvents in a UTC date range.
 * First-time events report unique users. play and song_shared report
 * total events and unique users. Every event is also split by platform
 * (`web`, `ios`, `unknown`). Plays are also split by `source`
 * (`share_page`, or `none` when the field is absent). The script does not write.
 */

import { FUNNEL_PLATFORMS, type FunnelPlatform } from '@/lib/funnel/platform';
import {
  FUNNEL_EVENTS,
  REPEAT_FUNNEL_EVENTS,
  type FunnelEvent,
  type RepeatFunnelEvent,
} from '@/lib/server/funnel';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type FunnelCountRow = {
  event: unknown;
  atMs: number;
  uid?: unknown;
  platform?: unknown;
  source?: unknown;
  visitorId?: unknown;
};

export type PlatformTotals = {
  events: number;
  users: number;
};

export type SourceTotals = {
  events: number;
  users: number;
};

export type FunnelEventCount = {
  events: number;
  users: number;
  byPlatform: Record<FunnelPlatform, PlatformTotals>;
  bySource: Record<string, SourceTotals>;
};

function emptyPlatformTotals(): Record<FunnelPlatform, PlatformTotals> {
  const totals = {} as Record<FunnelPlatform, PlatformTotals>;
  for (const platform of FUNNEL_PLATFORMS) totals[platform] = { events: 0, users: 0 };
  return totals;
}

export function emptyFunnelCounts(): Record<FunnelEvent, FunnelEventCount> {
  const counts = {} as Record<FunnelEvent, FunnelEventCount>;
  for (const event of FUNNEL_EVENTS) {
    counts[event] = { events: 0, users: 0, byPlatform: emptyPlatformTotals(), bySource: {} };
  }
  return counts;
}

/** A missing or unrecognized platform counts as unknown. */
export function countPlatform(value: unknown): FunnelPlatform {
  if (value === 'web' || value === 'ios' || value === 'unknown') return value;
  return 'unknown';
}

export function isRepeatFunnelEvent(event: FunnelEvent): event is RepeatFunnelEvent {
  return (REPEAT_FUNNEL_EVENTS as readonly string[]).includes(event);
}

/** Missing or unusable play source counts as `none`. */
export function countSource(value: unknown): string {
  if (typeof value !== 'string') return 'none';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[a-z0-9_-]+$/i.test(trimmed)) return 'none';
  return trimmed;
}

function playActor(row: FunnelCountRow): string | null {
  if (typeof row.uid === 'string' && row.uid) return `u:${row.uid}`;
  if (typeof row.visitorId === 'string' && row.visitorId) return `v:${row.visitorId}`;
  return null;
}

/** Start of a UTC calendar day. Invalid calendar dates return null. */
export function parseUtcDayStart(value: string): number | null {
  const match = DAY.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Inclusive range. `to` is the end of that UTC day.
 * Returns null when a day is invalid or the start is after the end.
 */
export function parseFunnelRange(
  from: string,
  to: string
): { fromMs: number; toMs: number } | null {
  const fromMs = parseUtcDayStart(from);
  const toStart = parseUtcDayStart(to);
  if (fromMs == null || toStart == null) return null;
  const toMs = toStart + 24 * 60 * 60 * 1000 - 1;
  if (fromMs > toMs) return null;
  return { fromMs, toMs };
}

export function countFunnelRows(
  rows: readonly FunnelCountRow[],
  fromMs: number,
  toMs: number
): Record<FunnelEvent, FunnelEventCount> {
  const counts = emptyFunnelCounts();
  const users = new Map<FunnelEvent, Set<string>>();
  const platformUsers = new Map<FunnelEvent, Record<FunnelPlatform, Set<string>>>();
  const sourceUsers = new Map<string, Set<string>>();
  for (const event of FUNNEL_EVENTS) {
    users.set(event, new Set());
    const sets = {} as Record<FunnelPlatform, Set<string>>;
    for (const platform of FUNNEL_PLATFORMS) sets[platform] = new Set();
    platformUsers.set(event, sets);
  }

  for (const row of rows) {
    if (typeof row.event !== 'string') continue;
    if (!(FUNNEL_EVENTS as readonly string[]).includes(row.event)) continue;
    if (!Number.isFinite(row.atMs) || row.atMs < fromMs || row.atMs > toMs) continue;
    const event = row.event as FunnelEvent;
    const platform = countPlatform(row.platform);
    counts[event].events += 1;
    counts[event].byPlatform[platform].events += 1;
    if (typeof row.uid === 'string' && row.uid) {
      users.get(event)?.add(row.uid);
      platformUsers.get(event)?.[platform].add(row.uid);
    }
    if (event === 'play') {
      const source = countSource(row.source);
      const slice = counts.play.bySource[source] ?? { events: 0, users: 0 };
      slice.events += 1;
      counts.play.bySource[source] = slice;
      const actor = playActor(row);
      if (actor) {
        const key = `${source}\n${actor}`;
        if (!sourceUsers.has(key)) {
          sourceUsers.set(key, new Set());
          slice.users += 1;
        }
      }
    }
  }

  for (const event of FUNNEL_EVENTS) {
    counts[event].users = users.get(event)?.size ?? 0;
    for (const platform of FUNNEL_PLATFORMS) {
      counts[event].byPlatform[platform].users = platformUsers.get(event)?.[platform].size ?? 0;
    }
  }
  return counts;
}

export function formatFunnelCounts(input: {
  projectId: string;
  from: string;
  to: string;
  counts: Record<FunnelEvent, FunnelEventCount>;
}): string {
  const lines = [`project=${input.projectId} from=${input.from} to=${input.to}`];
  for (const event of FUNNEL_EVENTS) {
    const count = input.counts[event];
    const parts = isRepeatFunnelEvent(event)
      ? [`${event} events=${count.events} users=${count.users}`]
      : [`${event} users=${count.users}`];
    for (const platform of FUNNEL_PLATFORMS) {
      const slice = count.byPlatform[platform];
      if (isRepeatFunnelEvent(event)) {
        parts.push(`${platform}_events=${slice.events} ${platform}_users=${slice.users}`);
      } else {
        parts.push(`${platform}_users=${slice.users}`);
      }
    }
    if (event === 'play') {
      for (const source of Object.keys(count.bySource).sort()) {
        const slice = count.bySource[source];
        parts.push(`source_${source}_events=${slice?.events ?? 0} source_${source}_users=${slice?.users ?? 0}`);
      }
    }
    lines.push(parts.join(' '));
  }
  return lines.join('\n');
}
