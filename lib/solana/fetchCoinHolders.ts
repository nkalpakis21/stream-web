const PUMP_COIN = 'https://frontend-api-v3.pump.fun/coins';
const FETCH_MS = 3000;

/**
 * Live holder count for an artist mint. Returns null when the source
 * does not report a real number — never invent holders.
 */
export async function fetchCoinHolders(mint: string): Promise<number | null> {
  const trimmed = mint.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);

  try {
    const res = await fetch(`${PUMP_COIN}/${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      holder_count?: unknown;
      holders?: unknown;
    };
    const raw = body.holder_count ?? body.holders;
    const count =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number.parseInt(raw, 10)
          : NaN;
    if (!Number.isFinite(count) || count < 0) return null;
    return Math.round(count);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
