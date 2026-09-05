type NetworkConnection = {
  saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type Listener = (forceStill: boolean) => void;

const listeners = new Set<Listener>();
let started = false;
let current = true;

function readForceStill(): boolean {
  if (typeof window === 'undefined') return true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = (navigator as Navigator & { connection?: NetworkConnection })
    .connection;
  return reduced || Boolean(connection?.saveData);
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (navigator as Navigator & { connection?: NetworkConnection })
    .connection;
  const update = () => {
    current = readForceStill();
    listeners.forEach(listener => listener(current));
  };

  current = readForceStill();
  media.addEventListener('change', update);
  connection?.addEventListener?.('change', update);
}

/** Shared prefers-reduced-motion + Save-Data signal. First paint stays still. */
export function subscribeForceCoverStill(listener: Listener): () => void {
  start();
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
