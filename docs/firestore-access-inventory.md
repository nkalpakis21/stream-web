# Firestore access inventory

Re-checked after merging `origin/develop` at `9176d8e` (Admin-SDK writes, account delete, coin metadata, `playRateLimits`). Prod project `stream-prod-864df` is still on Firebase test-mode rules until someone deploys this file. **These rules are not deployed.**

`request.auth` is set only when the Firebase JS client SDK runs in a signed-in browser session. Next.js server components and route handlers that import `@/lib/firebase/config` are signed-out as far as rules are concerned. Admin SDK calls (`firebase-admin`, `lib/server/*`, `getAdminDb()`) bypass rules.

## Mobile repo

`https://github.com/nkalpakis21/stream` is not readable from this environment. Nothing below was confirmed against Expo source.

Inferred from stream-web PR #92, and still covered:

| Path | Operation | Signed-out? | Notes |
| --- | --- | --- | --- |
| `songs` | list `where ownerId == uid`, then delete each doc | No | Account deletion |
| `artists` | delete own docs (`ownerId == uid`) | No | Account deletion |
| `users/{uid}` | delete | No | Does **not** cascade to `users/{uid}/private/profile` |
| `config/mobile` | get | Yes | Public read, no client write |

iOS TestFlight 14 and 15 create `songs`, `songVersions`, `generations`, `artists`, and `artistVersions` with client `setDoc`. Rules require `ownerId` or `createdBy` to be `request.auth.uid` on create. Updates cannot change `ownerId` / `createdBy`, and cannot write audio URLs, covers, `pumpFun`, `x`, `coinMetadataId`, `coinImagePath`, `playCount`, `playsBySource`, or `playsBackground`. The CTO says the app does not call `updateDoc`.

## Client list rules for songs and artists

A list is allowed only when the query guarantees `isPublic == true` or `ownerId == request.auth.uid`. A `get` of one document is allowed when that document is public or the caller owns it.

### Queries changed in this pass

| Call | Before | After |
| --- | --- | --- |
| `lib/services/artists.ts` `searchArtistsByName` (~623) | `nameLowercase` range + `deletedAt == null` | also `isPublic == true` |
| same function, index fallback (~656) | `deletedAt == null` only | `isPublic == true`, then filter name and `deletedAt` in memory |
| `lib/services/artists.ts` `checkArtistNameAvailable` (~314) | `nameLowercase ==` | `isPublic == true` + `deletedAt == null` + `nameLowercase ==` |
| same function, fallback (~339) | unbounded `limit(1000)` | `isPublic == true` |
| `lib/services/artists.ts` `getLaunchedArtistsByMints` (~553) | `pumpFun.mint in` | also `isPublic == true` |

No other web client list on `songs` or `artists` needed a new constraint. They already filter `isPublic == true` or `ownerId == uid`:

| Surface | Call | Constraint |
| --- | --- | --- |
| Heat (`app/page.tsx`, `getTopSongs`) | `lib/services/songs.ts` ~389 | `isPublic == true`, `deletedAt == null`, `orderBy playCount` |
| Heat fallback | ~408 | `isPublic == true` |
| Discover / live (`getPublicSongs`, `getPaginatedPublicSongs`, `getRecentSongs`, `searchSongsByPrompt`) | `songs.ts` ~308, ~322, ~341; `discovery.ts` ~39, ~66, ~110, ~138, ~190, ~248 | `isPublic == true` (paginated paths also `deletedAt == null`) |
| Feed (`getFollowedArtistsSongs`, `FeedPageClient` ~267) | `feed.ts` ~108 and ~170 | `isPublic == true` (`in` path also `artistId` and `deletedAt`) |
| Artist page song list | `getArtistSongs` `songs.ts` ~363; `getSongsByArtist` `discovery.ts` ~88 | `artistId` + `isPublic == true` |
| Dashboard | `getUserSongs` ~275, `getUserArtists` `artists.ts` ~239 | `ownerId == uid` |
| Artists index / sitemap | `getPublicArtists` ~280 | `isPublic == true` |

## Users

Public `users/{uid}` is display name, avatar, and timestamps. **`email` and `solanaWalletAddress` moved to `users/{uid}/private/profile`.**

Web reads of a user document go through `toPublicUser` in `lib/services/users.ts`, which copies only `id`, `displayName`, `photoURL`, `createdAt`, `updatedAt`, and `deletedAt`. Chat name fallbacks no longer read `email` off the public doc (`ConversationHeader`, `ChatView`). Profile and the menu still show the signed-in user's email from Firebase Auth, not from Firestore.

Writes:

| Location | What it writes |
| --- | --- |
| `lib/services/users.ts` `updateUserDisplayName` | Public doc: `displayName`, timestamps. If an email is passed (profile header and display-name form), `private/profile.email` via merge |
| `lib/server/usersAdmin.ts` `adminUpdateUserSolanaWallet` | `private/profile.solanaWalletAddress` and `email`. Deletes `email` and `solanaWalletAddress` from the public doc if it already exists |
| `scripts/migrate-user-documents.ts` | New public docs no longer store `email`. Email goes to `private/profile` |
| `scripts/migrate-user-private.ts` | One-time copy of `email` and `solanaWalletAddress` into the subdoc, then delete from the public doc. **Not run** |

`deleteAccount` reads email from the public doc and from `private/profile` before it deletes anything. `deleteAccountIdentity` calls `recursiveDelete` on `users/{uid}`, which deletes `private/profile` with the parent. A client `deleteDoc` of `users/{uid}` does not.

## Server-owned fields clients cannot write

| Collection | Locked on client create/update |
| --- | --- |
| `songs` | `ownerId` (immutable), covers (`albumCover*`, `coverPosterUrl`, `coverVideoUrl`, `coverMotion*`, `coverProvider`), `playCount`, `playsBySource`, `playsBackground`, legacy token fields. `playCount + 1` is no longer a client allowance. Plays go through Admin `adminIncrementPlayCount` |
| `artists` | `ownerId`, `pumpFun`, `x`, `coinMetadataId`, `coinImagePath` |
| `songVersions` | `createdBy`, `audioURL`, `providerOutputId`. Owner may still change `isPrimary` |
| `generations` | `output.audioURL`, `output.stems`. Create stays pending with null audio. Owner may update other fields. A foreign `ownerId` or `createdBy` on create is denied |
| `artistVersions` | `createdBy` and `artistId` cannot change. Owner may update the rest |
| `playRateLimits/**` | All client reads and writes denied. Admin only (`lib/server/playRateLimit.ts`) |
| `coinMetadataUploads/**` including `coinUploads` | All client reads and writes denied. Admin only |
| `config/mobile` | Public read. Client write denied |
| `artistXAuth`, `xSongPosts` | All client access denied |

## Admin SDK (bypasses rules)

These replaced the old client-SDK server writes from the previous inventory:

| Area | Module |
| --- | --- |
| MusicGPT webhook (audio, covers, generation status, versions) | `lib/server/musicgptWebhook.ts` |
| Play count, `playsBySource`, `playsBackground`, owner title / visibility, soft-delete | `lib/server/songsAdmin.ts`, `lib/server/playAttribution.ts`, `lib/server/playRateLimit.ts` |
| Artist name and bio | `lib/server/artistsAdmin.ts` |
| Wallet link | `lib/server/usersAdmin.ts` |
| Comments create/update/delete from the API | `lib/server/commentsAdmin.ts` (page `CommentForm` is still a browser client write) |
| Conversations and messages from the API | `lib/server/conversationsAdmin.ts` (`MessageComposer` is still a browser client write) |
| Stub generation status | `lib/server/generationsAdmin.ts` |
| Notifications created by the webhook | `lib/server/notificationsAdmin.ts` |
| Coin launch `pumpFun`, `coinMetadataId`, `coinImagePath` | `lib/services/artistPumpFun.ts` (Admin) |
| Account delete, including `private/profile` | `lib/server/deleteAccount.ts` `recursiveDelete` |
| X tokens and song-live posts | `lib/x/tokens.ts`, `lib/x/postSong.ts` |
| Cover pipeline | `lib/covers/store.ts` |

Browser flows that stay on the client SDK: public Heat / Discover / artist pages, dashboard owner lists, artist and song create, pending generation create, avatar update, display name, version `isPrimary`, comments typed on the page, follow, notification read receipts, chat send from `MessageComposer`, and owner delete of artists, songs, and `users/{uid}`.

## Indexes (`firestore.indexes.json`)

New composites required by the constraints above:

- `artists`: `isPublic ASC`, `deletedAt ASC`, `nameLowercase ASC` (name search and name availability)
- `artists`: `isPublic ASC`, `pumpFun.mint ASC` (mint lookup)

The file also records the song and artist composites the existing public and owner queries already use (Heat `playCount`, Discover `createdAt`, artist-page and feed `artistId`, owner lists). It is **not** a full export of production indexes. Chat, comments, follows, notifications, and messages composites are not in the file. Do not deploy indexes from this file until those are reconciled, or a deploy would delete them.

## Holes rules do not close

- **Test-mode prod rules** stay in force until this file is deployed. This change does not deploy.
- **Unmigrated user documents** still return `email` and `solanaWalletAddress` on a direct client `get`, because rules cannot hide fields. Web service reads strip them. Run `scripts/migrate-user-private.ts` (not run here) before treating a raw client get as safe.
- **Client `deleteDoc` of `users/{uid}`** (the #92 mobile path) does not delete `private/profile`. Web `DELETE /api/account` uses `recursiveDelete` and does.
- **Private songs and artists on server-rendered pages** (`app/songs/[id]/page.tsx`, `app/artists/[id]/page.tsx`) call `getSong` / `getArtist` with the client SDK and no user. A private doc fails that read for everyone, including the owner. X connect/pause/disconnect routes have the same `getArtist` gap.
- **`checkArtistNameAvailable`** only sees public artists, so it cannot tell that another user's private artist already has the name. Nothing in the app calls it. `adminUpdateArtistName` still checks every artist.
- **`getLaunchedArtistsByMints`** only returns public artists. It has no callers. An owner listing `ownerId == uid` still sees their private artists.
- **Name-availability fallback** reads up to 1000 public artists if the composite index is missing. It no longer lists the whole collection.
- **Direct-message fallback** still lists every `type == direct` conversation (`conversations.ts`). Rules deny it.
- **`getSongVersionGenerations`** queries `songVersionId` only. Rules cannot prove the parent song, so the query is denied. Nothing calls it.
- **An owner can update a generation's status** without writing audio. Audio URLs on `output` stay rejected. Completion with a real URL is the webhook's Admin write.
- **Song owner updates use a field allow-list.** A future server-owned field that is not in that list will make client title/visibility updates fail until the rules list it and mark it unchanged. `playsBySource` and `playsBackground` are on the list.

## Tests

```bash
pnpm test:rules
```

Uses the Firestore emulator and `@firebase/rules-unit-testing` against `demo-stream-rules`. It does not touch `stream-prod-864df`.
