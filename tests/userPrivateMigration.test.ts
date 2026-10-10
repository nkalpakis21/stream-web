import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripRecopyPayload } from '../lib/server/userPrivateMigration';

const PUBLIC_EMAIL = 'ada@example.com';
const COPIED_WALLET = 'CopiedWallet111111111111111111111111111';
const RELINKED_WALLET = 'RelinkedWallet1111111111111111111111111';
const PROMOTED_WALLET = 'PromotedWallet111111111111111111111111';

describe('strip re-copy of private/profile', () => {
  it('lets the public wallet win when a relink happened before promote', () => {
    const payload = stripRecopyPayload(
      {
        email: PUBLIC_EMAIL,
        solanaWalletAddress: RELINKED_WALLET,
      },
      {
        email: PUBLIC_EMAIL,
        solanaWalletAddress: COPIED_WALLET,
      }
    );

    assert.equal(payload.solanaWalletAddress, RELINKED_WALLET);
    assert.equal(Object.hasOwn(payload, 'email'), false);
  });

  it('keeps the private wallet when walletUpdatedAt is set after promote', () => {
    const payload = stripRecopyPayload(
      {
        email: PUBLIC_EMAIL,
        solanaWalletAddress: COPIED_WALLET,
      },
      {
        email: PUBLIC_EMAIL,
        solanaWalletAddress: PROMOTED_WALLET,
        walletUpdatedAt: { seconds: 1, nanoseconds: 0 },
      }
    );

    assert.equal(Object.hasOwn(payload, 'solanaWalletAddress'), false);
    assert.equal(Object.hasOwn(payload, 'email'), false);
  });

  it('copies email and wallet when private/profile does not exist', () => {
    const payload = stripRecopyPayload(
      {
        email: PUBLIC_EMAIL,
        solanaWalletAddress: COPIED_WALLET,
      },
      null
    );

    assert.deepEqual(payload, {
      email: PUBLIC_EMAIL,
      solanaWalletAddress: COPIED_WALLET,
    });
  });
});
