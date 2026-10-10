/**
 * Pure copy/strip decisions for scripts/migrate-user-private.ts.
 * The script is not run by the app, CI, or deploy.
 *
 * copy writes email and wallet onto private/profile and leaves the public doc.
 * strip re-copies with the rules below, then deletes those public fields.
 *
 * A relink before promote updates the public wallet and does not set
 * walletUpdatedAt, so the public wallet wins. A link after promote sets
 * walletUpdatedAt on private/profile, so strip leaves that wallet alone.
 * Email is copied only when private/profile does not already have one.
 */

export type UserFieldBag = Record<string, unknown> | null | undefined;

const PUBLIC_PRIVATE_FIELDS = ['email', 'solanaWalletAddress'] as const;

export function publicDocHasPrivateFields(data: UserFieldBag): boolean {
  if (!data) return false;
  return PUBLIC_PRIVATE_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(data, field)
  );
}

function publicEmail(data: UserFieldBag): string | undefined {
  if (data && typeof data.email === 'string') return data.email;
  return undefined;
}

function publicWallet(data: UserFieldBag): string | null | undefined {
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'solanaWalletAddress')) {
    return undefined;
  }
  const wallet = data.solanaWalletAddress;
  if (typeof wallet === 'string' || wallet === null) return wallet;
  return undefined;
}

/** Initial copy. Overwrites private email and wallet from the public doc. */
export function copyPayload(publicData: UserFieldBag): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  const email = publicEmail(publicData);
  if (email !== undefined) payload.email = email;
  const wallet = publicWallet(publicData);
  if (wallet !== undefined) payload.solanaWalletAddress = wallet;
  return payload;
}

function privateHasWalletUpdatedAt(privateData: UserFieldBag): boolean {
  return privateData != null && privateData.walletUpdatedAt != null;
}

function privateEmailMissing(privateData: UserFieldBag): boolean {
  return privateData == null || typeof privateData.email !== 'string';
}

/**
 * Strip's re-copy. Does not delete public fields; the script does that after.
 * Omitting solanaWalletAddress means the private wallet is left unchanged.
 */
export function stripRecopyPayload(
  publicData: UserFieldBag,
  privateData: UserFieldBag
): Record<string, string | null> {
  const payload: Record<string, string | null> = {};
  const email = publicEmail(publicData);
  if (privateEmailMissing(privateData) && email !== undefined) {
    payload.email = email;
  }
  if (!privateHasWalletUpdatedAt(privateData)) {
    const wallet = publicWallet(publicData);
    if (wallet !== undefined) payload.solanaWalletAddress = wallet;
  }
  return payload;
}
