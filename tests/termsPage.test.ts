import './render-setup';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from '../app/terms/page';
import { TERMS_VERSION } from '../lib/brand/site';

describe('terms page', () => {
  it('states zero tolerance, reporting, blocking, and the 24 hour review', () => {
    const html = renderToStaticMarkup(createElement(TermsPage));
    assert.equal(TERMS_VERSION, '2026-10-26');
    assert.match(html, new RegExp(`Version:</strong> ${TERMS_VERSION}`));
    assert.match(html, /October 26, 2026/);
    assert.match(html, /zero tolerance for objectionable content and abusive users/);
    assert.match(html, /report a song, an artist, or a comment/);
    assert.match(html, /block a user/);
    assert.match(html, /within 24 hours/);
    assert.match(html, /removing the content and ejecting the user who posted it/);
    assert.match(html, /You retain ownership/);
    assert.match(html, /legal@streamstar\.xyz/);
    assert.match(html, /THE SERVICE IS PROVIDED/);
  });
});
