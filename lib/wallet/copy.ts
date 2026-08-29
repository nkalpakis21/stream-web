/** User-facing wallet copy. Never mention Solana on the default path. */

export const WALLET_COPY = {
  connect: 'Connect wallet',
  connecting: 'Connecting…',
  change: 'Change',
  disconnect: 'Disconnect',
  launchHint: "You'll sign once. Small network fee.",
  pickerTitle: 'Connect wallet',
} as const;

export function connectedLabel(address: string): string {
  return `Connected · ${address.slice(-4)}`;
}
