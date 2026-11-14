import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getInitials } from '../lib/utils/avatar';

describe('getInitials', () => {
  it('uses one letter for a single word and two for a multi-word name', () => {
    assert.equal(getInitials('Jimmy'), 'J');
    assert.equal(getInitials('  jimmy '), 'J');
    assert.equal(getInitials('Jimmy Page'), 'JP');
    assert.equal(getInitials('Mary Ann Jones'), 'MJ');
    assert.equal(getInitials('A'), 'A');
    assert.equal(getInitials(''), '?');
    assert.equal(getInitials('   '), '?');
  });
});
