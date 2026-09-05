/** Soft 12px chip for song meta — never a stadium pill, never on cover art. */
export function CoinBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[12px] px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary"
      style={{ background: 'var(--surface-2, #1C1C28)' }}
    >
      Coin
    </span>
  );
}
