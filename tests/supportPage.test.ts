import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SupportPage, { dynamic, metadata } from '../app/support/page';
import { Footer } from '../components/layout/Footer';
import { PRIVACY_EMAIL } from '../lib/brand/site';

const FORBIDDEN = ['crypto', 'coin', 'wallet', 'token', 'pump.fun', 'trading'];

describe('support page', () => {
  it('renders the contact email and the account deletion section', () => {
    const html = renderToStaticMarkup(createElement(SupportPage));
    const escapedEmail = PRIVACY_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    assert.equal(dynamic, 'force-static');
    assert.deepEqual(metadata.title, { absolute: 'Support | Streamstar' });
    assert.match(String(metadata.description), /delete your account/i);
    assert.match(html, /<h1[^>]*>Support<\/h1>/);
    assert.match(html, new RegExp(`mailto:${escapedEmail}`));
    assert.match(html, new RegExp(escapedEmail));
    assert.match(html, /How to delete your account/);
    assert.match(html, /You, then Delete account/);
    assert.match(html, /href="\/privacy"/);

    const lower = html.toLowerCase();
    for (const word of FORBIDDEN) {
      assert.equal(lower.includes(word), false, `support page mentions ${word}`);
    }
  });

  it('links /support from the footer', () => {
    const html = renderToStaticMarkup(createElement(Footer));
    assert.match(html, /href="\/support"/);
    assert.match(html, />Support</);
  });
});
