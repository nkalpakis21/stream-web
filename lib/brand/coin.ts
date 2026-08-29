import type { PumpFunCoin } from '@/types/firestore';

/** True only when an artist has a real launched coin — never invent mint/url. */
export function hasLaunchedCoin(coin?: PumpFunCoin | null): boolean {
  return Boolean(coin?.mint && coin.url);
}
