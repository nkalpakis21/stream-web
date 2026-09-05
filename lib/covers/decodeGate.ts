/**
 * Limits how many list-surface cover videos decode at once.
 * Player / song-stage (`playback="always"`) bypass this gate.
 */

export const COVER_DECODE_CAP = 4;

type Waiter = {
  id: number;
  resolve: (granted: boolean) => void;
};

let nextId = 1;
const active = new Set<number>();
const queue: Waiter[] = [];

export function acquireCoverDecodeSlot(): {
  id: number;
  granted: Promise<boolean>;
} {
  const id = nextId++;
  if (active.size < COVER_DECODE_CAP) {
    active.add(id);
    return { id, granted: Promise.resolve(true) };
  }

  let resolve!: (granted: boolean) => void;
  const granted = new Promise<boolean>(r => {
    resolve = r;
  });
  queue.push({ id, resolve });
  return { id, granted };
}

export function releaseCoverDecodeSlot(id: number): void {
  const queued = queue.findIndex(waiter => waiter.id === id);
  if (queued >= 0) {
    const [waiter] = queue.splice(queued, 1);
    waiter.resolve(false);
    return;
  }

  if (!active.delete(id)) return;

  const next = queue.shift();
  if (next) {
    active.add(next.id);
    next.resolve(true);
  }
}
