/**
 * Deep-copy a server value into data a Client Component can receive.
 * Firestore Timestamp (anything with toMillis/toDate) and Date become epoch millis.
 */
export type Plain<T> = T extends Date
  ? number
  : T extends { toMillis(): number }
    ? number
    : T extends { toDate(): Date }
      ? number
      : T extends readonly (infer U)[]
        ? Plain<U>[]
        : T extends object
          ? { [K in keyof T]: Plain<T[K]> }
          : T;

function timeMillis(value: object): number | null {
  const record = value as { toMillis?: () => unknown; toDate?: () => unknown };
  if (typeof record.toMillis === 'function') {
    const ms = record.toMillis.call(value);
    if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
  }
  if (typeof record.toDate === 'function') {
    const date = record.toDate.call(value);
    if (date instanceof Date) {
      const ms = date.getTime();
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

function isTimeValue(value: object): boolean {
  if (value instanceof Date) return false;
  const record = value as { toMillis?: unknown; toDate?: unknown };
  return typeof record.toMillis === 'function' || typeof record.toDate === 'function';
}

function plainValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return value;
  if (kind === 'number') return Number.isFinite(value) ? value : null;
  if (kind === 'bigint') return value.toString();
  if (kind !== 'object') return undefined;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (seen.has(value)) return null;
  seen.add(value);

  if (isTimeValue(value)) return timeMillis(value);

  if (Array.isArray(value)) {
    return value.map(item => plainValue(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const child = plainValue((value as Record<string, unknown>)[key], seen);
    if (child !== undefined) output[key] = child;
  }
  return output;
}

export function toPlain<T>(value: T): Plain<T> {
  return plainValue(value, new WeakSet()) as Plain<T>;
}
