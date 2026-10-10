# Firestore access inventory

Prod project `stream-prod-864df` is still on Firebase test-mode rules (open read/write until 2027-01-12). This repo's `firestore.rules` had never been deployed. The rules in this change are the lock-down. They are **not deployed**.

`request.auth` is set only when the Firebase JS client SDK runs in a browser session that is signed in. Next.js server components and route handlers that import `@/lib/firebase/config` use that same client SDK **without** a user. Those calls are signed-out as far as rules are concerned, even when the HTTP request carried a verified ID token. Admin SDK calls (`firebase-admin`) bypass rules.

## Mobile repo

`https://github.com/nkalpakis21/stream` is not readable from this environment. `gh repo view` and `git ls-remote` both return not found (private repo or a token that cannot see it). Nothing below was confirmed against Expo source.

Inferred only from stream-web PR #92, and covered by these rules:

| Path | Operation | Signed-out? | Notes |
| --- | --- | --- | --- |
| `songs` | list `where ownerId == uid`, then delete each doc | No (requires the signed-in owner) | Account deletion |
| `artists` | delete own docs (`ownerId == uid`) | No | Account deletion |
| `users/{uid}` | delete | No | Account deletion. Web never hard-deletes users |
| `config/mobile` | get `walletEnabled`, `coinsEnabled` | Yes | Public read, no client write. Not referenced in stream-web |

Other mobile reads or writes are unclassified. Do not treat this list as a complete Expo audit.

## How to read the web inventory

- **Signed-out: yes** means a logged-out visitor or a server render hits it.
- **Signed-out: server SDK** means a route handler uses the client SDK, so rules see `request.auth == null` even if the handler checked a bearer token.
- **Rules** is what `firestore.rules` does for that call when the client presents the principal in the last column.

Line numbers are the Firestore call, not the function signature.

## Client SDK (`firebase/firestore`)

### `users/{uid}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/users.ts:32` `getUser` | get | Yes (profile, chat, SSR helpers) | — | Public get |
| `lib/services/users.ts:79` | update | No (profile forms in the browser) | `displayName`, `updatedAt` | Owner only. Email cannot change |
| `lib/services/users.ts:86` | create | No (browser, first display-name save) | `email`, `displayName`, `photoURL`, `createdAt`, `updatedAt`, `deletedAt` | Owner path only |
| `lib/services/users.ts:135` | update | Server SDK (`app/api/users/link-wallet/route.ts`, token checked, then client SDK) | `solanaWalletAddress`, `updatedAt` | Allowed only when `request.auth.uid` is the path. **This route is denied until it uses the Admin SDK** |
| `lib/services/users.ts:141` | create | Same route, if the user doc is missing | email, displayName, photoURL, timestamps, `deletedAt`, `solanaWalletAddress` | Same gap |
| `lib/services/users.ts:266` and `:295` | list `displayName` prefix, optional `deletedAt == null` | Server SDK (`app/api/users/search`) | — | Allowed (displayName is a string). Returns full docs, including email and wallet |
| `components/chat/ConversationHeader.tsx:79` | get | No | — | Public get |

`getUsersDisplayNames` / `getUsersData` / `getUsersFromFollowedArtists` are more gets of `users/{id}`. No other user writes.

### `artists/{artistId}` and `artistVersions/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/artists.ts:97` | create | No (`CreativeArtistForm`) | id, ownerId, name, nameLowercase, avatarURL, styleDNA, lore, vocalIdentity, isPublic, timestamps, deletedAt, currentVersionId, **pumpFun all-null**, **x disconnected** | Owner create. A real mint or a connected X profile is denied |
| `lib/services/artists.ts:98` | create `artistVersions` | No | id, artistId, versionNumber, name, avatarURL, styleDNA, lore, vocalIdentity, createdBy, createdAt, parentVersionId | Owner of that artist |
| `lib/services/artists.ts:110` | get | Yes (song/artist pages, SSR) | — | Public if `isPublic`, else owner |
| `lib/services/artists.ts:124` | get version | Yes if something calls it | — | Same as parent artist. No external callers |
| `lib/services/artists.ts:137` | list `artistId` | Same | — | Same |
| `lib/services/artists.ts:192` | create version | Browser for avatar; server SDK for name/bio APIs | version fields, `createdBy` = caller | Owner. Name/bio routes do not attach Auth, so **those updates are denied on deploy** |
| `lib/services/artists.ts:196` | merge | Same | name, nameLowercase, avatarURL, styleDNA, lore, vocalIdentity, currentVersionId, updatedAt | Owner. `ownerId`, `pumpFun`, and `x` cannot change |
| `lib/services/artists.ts:223` / `:240` | list `ownerId == uid` | No (dashboard) | — | That uid only |
| `lib/services/artists.ts:264` | list `isPublic == true` | Yes (artists index, sitemap) | — | Allowed |
| `lib/services/artists.ts:298` | list `nameLowercase ==` | Server SDK (name update) | — | Allowed |
| `lib/services/artists.ts:322` | list first 1000, no filter | Fallback only | — | **Denied** |
| `lib/services/artists.ts:532` | list `pumpFun.mint in` | No callers | — | Allowed (mint is a string) |
| `lib/services/artists.ts:601` | list name prefix + `deletedAt == null` | Yes (search API, discovery) | — | Allowed via the nameLowercase constraint |
| `lib/services/artists.ts:633` | list `deletedAt == null` only | Fallback only | — | **Denied** |
| `components/chat/ConversationHeader.tsx:43` | get | No | — | Public or owner |

`updateArtistName`, `updateArtistLore`, and `updateArtistAvatar` all go through `createArtistVersion`. Avatar is a browser call (`ArtistHero`). Name and lore are `PATCH /api/artists/[id]/name` and `/bio`, which verify the user and then write with the client SDK.

### `songs/{songId}` and `songVersions/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/songs.ts:56` | get artist (ownership check) | No (create flow) | — | Owner can read their artist |
| `lib/services/songs.ts:119` | create song | No (`CreativeSongForm`) | id, ownerId, artistId, artistVersionId, title, isPublic, timestamps, deletedAt, currentVersionId, parentSongId, collaborationType, album covers null, cover* null, playCount 0 | Owner of that artist. Non-null cover or token fields denied |
| `lib/services/songs.ts:120` | create version | No | id, songId, versionNumber, title, createdBy, createdAt, parentVersionId, **audioURL null**, **providerOutputId null**, isPrimary | Owner. An audio URL is denied |
| `lib/services/songs.ts:152` | get | Yes (song page, homepage metadata) | — | `isPublic` or owner |
| `lib/services/songs.ts:168` | update | No callers | `tokenMintAddress`, `tokenMintCreatedAt`, `updatedAt` | **Denied** (legacy token fields) |
| `lib/services/songs.ts:182` | get version | Yes (song page re-export) | — | Parent song public or owner |
| `lib/services/songs.ts:195` | list `songId` | Yes (homepage, song page, version listeners) | — | Same |
| `lib/services/songs.ts:250` / `:261` | create version + merge song | No callers | version as above; song `title`, `updatedAt`, optional `currentVersionId` | Would be allowed for the owner |
| `lib/services/songs.ts:273` | list `ownerId == uid` | No (dashboard) | — | That uid only. This is the mobile account-deletion list |
| `lib/services/songs.ts:306` / `:320` / `:339` | list `isPublic` (+ optional `deletedAt`) | Yes | — | Allowed |
| `lib/services/songs.ts:361` | list `artistId` + `isPublic` | Yes (artist page) | — | Allowed |
| `lib/services/songs.ts:387` / `:406` | list public, ordered by plays or createdAt | Yes | — | Allowed |
| `lib/services/songs.ts:449` | list versions `songId` | Browser owner, and server SDK from the webhook | — | Public song or owner |
| `lib/services/songs.ts:474` | batch update versions | Same | `isPrimary` | Owner only. Webhook call is signed-out, so **denied** |
| `lib/services/songs.ts:479` | batch update song | Same | `currentVersionId`, `updatedAt` | Owner only. Webhook **denied** |
| `lib/services/songs.ts:549`–`:580` | same primary-version repair | No callers | `isPrimary`, `currentVersionId`, `updatedAt` | Owner only |
| `lib/services/songs.ts:674` | batch update notifications | Server SDK (`DELETE /api/songs/[id]`, body `userId`, no token) | `deletedAt` | Song owner, and only when `request.auth` is that owner. **Route denied on deploy** |
| `lib/services/songs.ts:680` | batch update song | Same | `deletedAt`, `updatedAt` | Owner soft-delete. **Route denied** |
| `app/api/songs/[id]/route.ts:48` | update | Yes (play tracking has no auth; the handler also accepts `title`, `isPublic`, and a raw playCount) | `playCount` and/or `title`, `isPublic` | Signed-out **+1 playCount only**. Title, visibility, and absolute playCount denied |
| `components/songs/SongVersionsSection.tsx:49` | onSnapshot `songId` | Yes (listener is not gated on auth) | — | Public song or owner |
| `components/songs/VersionCards.tsx:45` | onSnapshot `songId` | Yes | — | Same |
| `components/feed/FeedPageClient.tsx:275` | onSnapshot `artistId in` + `isPublic` + `deletedAt == null` | No | — | Allowed by `isPublic == true` |
| `lib/services/discovery.ts` | list public songs (several shapes, all `isPublic == true`) | Yes (discover API / SSR) | — | Allowed |
| `lib/services/feed.ts:108` | list `artistId in` + public + not deleted | Server SDK (`/api/feed?userId=`) | — | Allowed |

### `generations/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/generations.ts:159` | create | No (`CreativeSongForm` after `/api/generations/musicgpt`) | full pending job: ids, prompt, parameters, provider, status `pending`, providerTaskId, conversion ids, empty output, error null, contentHash null | Owner of the song, **pending only**, `output.audioURL` and `stems` null |
| `lib/services/generations.ts:288` | update | Browser, stub provider only | status, completedAt, output, error, contentHash | **Denied.** Stub completion breaks; MusicGPT completion must move to Admin SDK |
| `lib/services/generations.ts:298` | get | If called | — | Parent song public or owner |
| `lib/services/generations.ts:311` | list `songVersionId` | No callers | — | Same, if the query equality-filters `songId`. A `songVersionId` query does **not** and is denied |
| `lib/services/generations.ts:326` | list `songId` | Yes (song page SSR, for lyrics / pending state) | — | Allowed for a public song |
| `app/api/webhooks/musicgpt/route.ts:189` | list `providerTaskId` | Server SDK, no user | — | **Denied** |
| `:215` merge song | update | Same | album cover fields, `updatedAt` | **Denied** (cover fields are not in the owner allow-list) |
| `:248` merge generation | update | Same | `output` metadata | **Denied** |
| `:270` / `:279` | list `providerConversionIds` array-contains, or `providerTaskId` | Same | — | **Denied** |
| `:309` / `:346` | merge generation | Same | lyrics metadata on `output` | **Denied** |
| `:383` | list `providerTaskId` | Same | — | **Denied** |
| `:393` / `:401` | list `status == pending` or `processing` | Same | — | **Denied** (would scan every job) |
| `:475` / `:619` | merge generation | Same | processed ids, status, completedAt, output audio | **Denied** |
| `:513` | create `songVersions` | Same | version **with audioURL and providerOutputId** | **Denied** |
| `:526` | merge song | Same | `coverMotionStatus`, `coverMotionError`, `coverUpdatedAt`, `updatedAt` | **Denied** |

`getSongVersionGenerations` is not used. Song-page lyrics come from `getSongGenerations`.

### `notifications/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/notifications.ts:39` | list user + song + generation | Server SDK (webhook) | — | Recipient or song owner. Webhook is neither in `request.auth`, so **denied** |
| `:65` | create | Webhook | id, userId, songId, generationId, type, read, createdAt, deletedAt | **Denied.** Server-owned |
| `:76` / `:94` | list `userId` + `read == false` | No (`UserMenu`, dropdown) | — | That user |
| `:120` | list `songId` | Server SDK (song soft-delete) | — | Song owner only |
| `:174` | update | No (browser) | `read: true` | Recipient only |
| `components/navigation/UserMenu.tsx:42` | onSnapshot `userId` + `read == false` | No | — | That user |

### `follows/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/follows.ts:63` | create | No (`FollowButton`) | id, followerId, artistId, createdAt | `followerId` must be `request.auth.uid` |
| `:74` | list follower + artist | No | — | Public read |
| `:86` | delete | No | — | That follower |
| `:97` | list follower + artist | No | — | Public read |
| `:119` / `:133` | list `followerId` | No (bag, feed) | — | Public read |
| `:158` / `:172` / `:193` | list `artistId` | Yes (`FollowersList` on public artist pages) | — | Public read |

Documents are only follower id, artist id, and time.

### `comments/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/comments.ts:76` | create | No in `CommentForm`. Also `POST /api/comments`, which takes `authorId` from the body and uses the client SDK | id, targetType, targetId, authorId, content, parentCommentId, timestamps, deletedAt | Author must be `request.auth.uid`. The API path is **denied** and was forgeable |
| `:85` | get | Yes | — | Non-deleted only |
| `:113` / `:166` | list target + `deletedAt == null` | Yes (`CommentsSection`) | — | Allowed |
| `:215` / `:252` | list `parentCommentId` + `deletedAt == null` | Yes | — | Allowed |
| `:313` | update | Browser author, and the comments API | `content`, `updatedAt` | Author only. API path denied |
| `:336` | update | Same | `deletedAt` | Author only |
| `:348` | list target + `deletedAt == null` | If called | — | Allowed |

### `conversations/{id}` and `messages/{id}`

| Location | Op | Signed-out? | Fields written | Rules |
| --- | --- | --- | --- | --- |
| `lib/services/conversations.ts:91` | create | Server SDK (`POST /api/conversations`). `createdBy` / `x-user-id` is client-supplied, not a Firebase user on the SDK | id, type, participants, timestamps, lastMessage*, optional artistId, createdBy, artistIds | Caller must be in `participants` **and** `request.auth` must be set. **Create-from-API is denied on deploy** |
| `:104` | list `type == direct` + `array-contains` user | During create | — | Allowed for that user when signed in on the SDK |
| `:126` | list `type == direct` (every DM) | Index fallback | — | **Denied** |
| `:153` | list type + artistId + participant | During create | — | Participant |
| `:175` | list every direct conversation | Index fallback | — | **Denied** |
| `:203` | get artist | No | — | Public or owner |
| `:224` | get | No | — | Participants |
| `:241` / `:255` | list `array-contains` user | No (browser) and server SDK `GET /api/conversations?userId=` | — | Browser path allowed. API path denied |
| `:300` | update | If called | `participants` arrayUnion, `updatedAt` | Group member |
| `:338` | update | If called | `participants` arrayRemove, `updatedAt` | Group member |
| `:352` | update | Browser send, and API send | `lastMessageAt`, `lastMessagePreview`, `updatedAt` | Participant. API path denied |
| `:393` | update | Server SDK (`PATCH /api/conversations/[id]`) | `title`, `updatedAt` | Creator, and `request.auth` required. **API path denied** |
| `components/chat/ChatList.tsx:132` | onSnapshot `array-contains` uid | No | — | That user |
| `lib/services/messages.ts:74` | create | Browser `MessageComposer` (works). Also `POST /api/conversations/[id]/messages` (server SDK) | id, conversationId, senderId, content, createdAt, readBy, deletedAt | Sender is `request.auth.uid` and a participant. API path denied |
| `:95` / `:148` | list `conversationId` + `deletedAt == null` | Browser and API | — | Participants. API path denied |
| `:205` | update | Browser | `readBy` arrayUnion | Participant may add only themselves |
| `:221` get / `:233` update | soft-delete | If called | `deletedAt` | Sender only. Hard delete denied |
| `components/chat/ChatView.tsx:128` | onSnapshot `conversationId` + `deletedAt == null` | No | — | Participants |

### `collaborations/{id}`

Defined in `lib/services/collaborations.ts` (`:50` create, `:62` get, `:75` list `sourceSongId`). No callers outside that file. Rules: create only as `collaboratorId == request.auth.uid`; list only with a `sourceSongId` constraint; no update or delete. Fields: id, type, sourceSongId, targetSongId, collaboratorId, notes, createdAt.

### `config/mobile`

No stream-web client. Rules: public read, write denied. Any other `config/*` doc is denied.

### Direct SDK setup

`lib/firebase/config.ts:82` initializes the client. `types/firestore.ts` only imports the `Timestamp` type.

## Admin SDK (bypasses rules)

These do **not** need client allow rules. They are the path covers, coins, and X tokens should keep using.

| Location | Path | Op | Fields |
| --- | --- | --- | --- |
| `lib/x/tokens.ts:22` | `artistXAuth/{artistId}` | set | accessToken, refreshToken, expiry, tokenType, scope, artistId, ownerId, updatedAtMs |
| `lib/x/tokens.ts:36` | same | get | — |
| `lib/x/tokens.ts:45` | same | delete | — |
| `lib/x/artistStore.ts:21` | `artists/{id}` | get | — |
| `lib/x/artistStore.ts:27` | `songs/{id}` | get | — |
| `lib/x/artistStore.ts:52` | `artists/{id}` | merge | `x` (status, errors, profile, post log). No tokens |
| `lib/x/artistStore.ts:69` | `artists/{id}` | merge | `x.posts`, `x.recentPostTexts`, clear last error |
| `lib/x/postSong.ts:53` | `songVersions` | list `songId` | — |
| `lib/x/postSong.ts:151` | `xSongPosts/{songId}` | create | songId, artistId, status pending, createdAtMs |
| `lib/x/postSong.ts:181` / `:235` | same | delete | claim rollback |
| `lib/x/postSong.ts:213` / `:228` | same | merge | status posted/failed, tweet id, url, times, reason |
| `lib/services/artistPumpFun.ts:66` | `artists/{id}` | transaction get + merge | `pumpFun` (mint, url, symbol, launchedAt, creatorWallet), `updatedAt`. Owner checked in code |
| `lib/covers/store.ts:46` | `songs/{id}` | merge | coverPosterUrl, coverVideoUrl, coverMotionStatus, coverMotionError, coverProvider, coverUpdatedAt, updatedAt |
| `lib/covers/generate.ts:32` | `generations` | list `songId` | — |
| `lib/covers/backfill.ts:154` | `songs` | list ordered by `createdAt` | — |
| `app/api/me/holdings/route.ts:34` | `artists` | list `ownerId == uid` | — after `requireUserId` |
| `scripts/migrate-primary-versions.ts` | `songs`, `songVersions` | list + batch update | `isPrimary`, `currentVersionId` |
| `scripts/migrate-user-documents.ts` | `users` | list + set | displayName backfill |

`lib/covers/storage.ts` and the look/metadata upload routes use Admin Storage, not Firestore.

## What deploy will break

Rules match the browser principal, not the server-side client SDK. Shipping them to prod without moving the following writes to the Admin SDK (after the auth check they already do, or need) will break those features:

1. **MusicGPT webhook** (`app/api/webhooks/musicgpt/route.ts`). It finds jobs with unbounded status queries and writes audio URLs, generation status, album-cover fields, cover-motion fields, primary version, and notifications through the client SDK. Those writes are denied on purpose. Audio will not land until this handler uses `getAdminDb()`.
2. **Artist name and bio** (`PATCH /api/artists/[id]/name` and `/bio`).
3. **Wallet link** (`POST /api/users/link-wallet`).
4. **Song soft-delete** (`DELETE /api/songs/[id]` trusts `body.userId`).
5. **Opening a chat and editing its title** (`/api/conversations`), because create never attaches Firebase Auth to the SDK. Sending a message from `MessageComposer` is a browser call and still works. The messages API does not.
6. **Comments API** (`/api/comments`). The on-page `CommentForm` is a browser call and still works.
7. **Notification create** inside the webhook.
8. **Stub provider** completion (`updateGenerationStatus`). Dev-only.

Browser flows that stay allowed: public pages, play-count +1, follow, comments typed in the page, dashboard lists, artist/song create, pending generation create, avatar update, display name, version `isPrimary` from the song page, notification read receipts, and (once the client is signed in) owner delete of artists, songs, and `users/{uid}`.

`PATCH /api/songs/[id]` play tracking keeps working for `playCount: "increment"` only.

## Holes rules do not close

- **Test-mode prod rules** stay in force until someone deploys this file. This change does not deploy.
- **Webhook signature check returns true** (`app/api/webhooks/musicgpt/route.ts` around the "TEMPORARILY BYPASSED" log). Anyone who can POST the webhook can drive the handler. After the handler moves to the Admin SDK that becomes a privileged write path. Fix the signature check in the same change.
- **`users` documents are world-readable**, because display names are loaded signed-out and email / `solanaWalletAddress` share the document. Rules cannot hide fields. Split secrets onto a server-only doc before treating profile reads as safe.
- **Artist name search returns whole documents**, including `isPublic: false` artists, because `searchArtistsByName` does not filter `isPublic`. A `nameLowercase` constraint is enough for the query to be legal. Adding `where('isPublic','==',true)` would let the rule require it.
- **`checkArtistNameAvailable` fallback** lists up to 1000 artists with no filter (`artists.ts:322`). Rules deny it. If the index is missing, name checks fail closed instead of dumping the collection.
- **Direct-message fallback** lists every `type == direct` conversation (`conversations.ts:126` and `:175`). Rules deny it.
- **`getSongVersionGenerations`** queries `songVersionId` only. Rules cannot prove the parent song from that field, so the query is denied. Nothing calls it. The song page queries `songId`, which is allowed.
- **`PATCH /api/songs/[id]`** has no auth check. Rules now ignore `title`, `isPublic`, and absolute `playCount` from that handler. Play counts can still be inflated one step at a time.
- **`DELETE /api/songs/[id]` and `POST /api/comments` and `POST /api/conversations`** trust ids from the body. Rules reject the write. The handlers should still stop trusting body ids.
- **Private songs on the server-rendered song page** (`app/songs/[id]/page.tsx`) call `getSong` with no user. A song with `isPublic != true` will fail that read for everyone, including the owner. The page's own comment says the auth check is still a TODO. Default create is `isPublic: true`.
- **Mobile client** beyond the four #92 operations was not reviewed.

## Tests

```bash
pnpm test:rules
```

Requires Java (Firestore emulator) and the `firebase` CLI. The suite uses `@firebase/rules-unit-testing` against `demo-stream-rules`. It does not touch `stream-prod-864df`.

## Relation to PR #92

This file replaces the draft rules on #92. It keeps that PR's owner deletes (artists, songs listed by `ownerId`, `users/{uid}`) and the public read-only `config/mobile` document, and fills in the rest of the client surface. #92 is superseded by the PR that adds this inventory. It was not closed from here.
