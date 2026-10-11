/**
 * Paths whose response varies by ss_viewer or Authorization.
 * next.config.js attaches Cache-Control: private, no-store so a shared CDN
 * cannot replay one viewer's artist payload to someone else.
 *
 * Public lookups stay off this list: /api/artists/search, /api/artists/display,
 * and /api/artists/:id/coin-quote.
 */
const VIEWER_CACHE_CONTROL = 'private, no-store';

const VIEWER_NO_STORE_SOURCES = [
  '/artists/:id',
  '/api/auth/viewer',
  '/api/artists/batch',
  '/api/artists/followed',
  '/api/artists/:id((?!search$|display$|batch$|followed$|looks$|pump-fun$)[^/]+)',
  '/api/artists/:id/name',
  '/api/artists/:id/bio',
  '/api/artists/:id/pump-fun',
  '/api/artists/looks',
  '/api/artists/looks/upload',
  '/api/artists/pump-fun/metadata',
  '/api/artists/pump-fun/create-tx',
  '/api/x/connect',
  '/api/x/pause',
  '/api/x/disconnect',
  '/api/x/artists/:id',
  '/api/me/holdings',
  '/api/account',
  '/api/conversations',
  '/api/conversations/:id',
  '/api/conversations/:id/messages',
  '/api/songs/:id',
  '/api/users/link-wallet',
  '/api/generations/:id/status',
  '/api/generations/musicgpt',
  '/api/webhooks/musicgpt/simulate',
  '/api/covers/generate',
  '/api/covers/backfill',
  '/api/comments',
];

module.exports = { VIEWER_CACHE_CONTROL, VIEWER_NO_STORE_SOURCES };
