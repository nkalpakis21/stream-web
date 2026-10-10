import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRecentSignIn, RECENT_LOGIN_WINDOW_SECONDS } from './accountAuth';
import {
  collectEmails,
  isAuthUserNotFound,
  isPersonalValue,
  stripPersonalFields,
} from './deleteAccount';

describe('recent sign-in', () => {
  const now = 1_700_000_000;

  it('accepts auth_time inside the 5 minute window', () => {
    assert.equal(isRecentSignIn(now - RECENT_LOGIN_WINDOW_SECONDS, now), true);
    assert.equal(isRecentSignIn(now - 1, now), true);
  });

  it('rejects auth_time older than 5 minutes', () => {
    assert.equal(isRecentSignIn(now - RECENT_LOGIN_WINDOW_SECONDS - 1, now), false);
  });
});

describe('coin personal fields', () => {
  const uid = 'user-1';
  const emails = collectEmails('Person@Example.com', 'person@example.com', null, 'not-an-email');

  it('keeps one email and ignores values that are not emails', () => {
    assert.deepEqual(emails, ['Person@Example.com']);
  });

  it('matches uid exactly and email case-insensitively', () => {
    assert.equal(isPersonalValue(uid, uid, emails), true);
    assert.equal(isPersonalValue('person@example.com', uid, emails), true);
    assert.equal(isPersonalValue('https://example.com/user-1', uid, emails), false);
  });

  it('strips uid and email fields and keeps the rest of the coin record', () => {
    const coin = {
      name: 'Nova',
      symbol: 'NOVA',
      description: 'Nova on Streamstar',
      image: 'https://example.com/look.png',
      uploadedBy: uid,
      ownerEmail: 'person@example.com',
      nested: { note: 'keep', email: 'Person@Example.com' },
      tags: ['keep', uid],
    };

    const stripped = stripPersonalFields(coin, uid, emails);
    assert.equal(stripped.changed, true);
    assert.deepEqual(stripped.value, {
      name: 'Nova',
      symbol: 'NOVA',
      description: 'Nova on Streamstar',
      image: 'https://example.com/look.png',
      nested: { note: 'keep' },
      tags: ['keep'],
    });
  });

  it('does not rewrite a coin record with no personal values', () => {
    const coin = { name: 'Nova', symbol: 'NOVA', image: 'https://example.com/a.png' };
    const stripped = stripPersonalFields(coin, uid, emails);
    assert.equal(stripped.changed, false);
    assert.equal(stripped.value, coin);
  });
});

describe('auth user already gone', () => {
  it('treats auth/user-not-found as success', () => {
    assert.equal(isAuthUserNotFound({ code: 'auth/user-not-found' }), true);
    assert.equal(
      isAuthUserNotFound({ errorInfo: { code: 'auth/user-not-found' } }),
      true
    );
    assert.equal(isAuthUserNotFound({ code: 'auth/internal-error' }), false);
    assert.equal(isAuthUserNotFound(new Error('auth/user-not-found')), false);
  });
});
