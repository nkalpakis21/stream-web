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
| `users/{uid}` | delete | No | Owner delete of their own profile doc |
| `config/mobile` | get | Yes | Public read, no client write |

iOS TestFlight 14 and 15 create `songs`, `songVersions`, `generations`, `artists`, and `artistVersions` with client `setDoc`. Song and artist creates require `ownerId == request.auth.uid`. Version creates require `createdBy == request.auth.uid`. Generation creates require the parent song's owner. `ownerId` is optional there: TF 15 omits it, and web sends the caller's uid. Updates cannot change `ownerId` / `createdBy`, and cannot write audio URLs, covers, `pumpFun`, `x`, `coinMetadataId`, `coinImagePath`, `playCount`, `playsBySource`, or `playsBackground`. The CTO says the app does not call `updateDoc`.

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

TF 15 never reads `users/{uid}`. It reads email and display name from Firebase Auth and posts the device wallet to `POST /api/users/link-wallet`. The public doc stays world-readable and holds only public fields. `email` and `solanaWalletAddress` live on owner-only `users/{uid}/private/profile`. No other private field was on the profile. `scripts/migrate-user-private.ts` is **not run**. `copy` writes email and wallet onto `private/profile` and leaves the public doc. `strip` re-copies (public wallet wins unless `walletUpdatedAt` is set; email is copied only when missing), then deletes the public fields. Clients cannot write `private/profile`.

Public fields (`UserDocument`): `displayName`, `photoURL`, `createdAt`, `updatedAt`, `deletedAt`.

Private fields (`UserPrivateProfile`): `email`, `solanaWalletAddress`, `walletUpdatedAt` (Admin link-wallet only).

`toPublicUser` in `lib/services/users.ts` 28–37 drops anything else off a public-doc read. Chat (`ChatView.tsx` 271, `ConversationHeader.tsx` 85) uses `displayName` only. Search and followed-artist routes spread that public shape, so they no longer return email or wallet.

| Location | Whose doc | What |
| --- | --- | --- |
| `lib/services/users.ts` `getUser` 46–50 | Any uid, including own (`ProfileHeader.tsx` 35, `DisplayNameForm.tsx` 31, `BagIdentity.tsx` 31) | Public fields. Drops the doc if `deletedAt` is set |
| `getUserDisplayName` 139–150 | Any uid. Comments (`CommentThread.tsx` 44, 46) and chat lists (`ChatList.tsx` 90) | `displayName`, else a truncated uid |
| `getUsersData` 226 | Other senders, and the signed-in sender, in `ChatView.tsx` 69 | Public fields, including `photoURL` at `ChatView.tsx` 317 |
| `searchUsersByDisplayName` 275 and `getUsersFromFollowedArtists` 388 | Other users | Public fields. Routes `app/api/users/search/route.ts` 44 and `app/api/users/followed/route.ts` 26 |
| `getUserPrivateProfile` 61–74 | Own uid only. Rules deny everyone else. No web caller yet | `email`, `solanaWalletAddress` |
| `updateUserDisplayName` | Own | Public: `displayName`, `updatedAt` (create also `photoURL: null` and timestamps). Does not write `private/profile` |
| `ProfileHeader.tsx` and `DisplayNameForm.tsx` | Own | Call that update. Email on screen is Firebase Auth |
| `lib/server/usersAdmin.ts` | Own. Admin. `app/api/users/link-wallet/route.ts` | Writes `solanaWalletAddress`, `walletUpdatedAt`, and `email` on `private/profile`. Deletes those public fields if the user doc already exists. Response body is unchanged |
| `lib/server/deleteAccount.ts` 945–955 and 805 | Own. Admin | Reads `email` from the public doc and from `private/profile`. `recursiveDelete` removes the subdoc |
| `scripts/migrate-user-documents.ts` 280–288 | Own Auth uid. Admin. **Not run** | Public create without email; email goes to `private/profile` |
| `scripts/migrate-user-private.ts` | Existing docs. Admin. **Not run** | `copy` then later `strip`. Both accept `--dry-run` |

Auth-only, not a Firestore read: `UserMenu.tsx` 25–26 and 188, `InvestingPageClient.tsx` 311, `ProfileHeader.tsx` 96–97 and 163, `DisplayNameForm.tsx` 169, `BagIdentity.tsx` 13.

Rules reject client creates and updates that include `email` or `solanaWalletAddress` on `users/{uid}`. The owner may still change `displayName`, `updatedAt`, and `photoURL`. No web code updates `photoURL` on an existing doc.

## Server-owned fields clients cannot write

| Collection | Locked on client create/update |
| --- | --- |
| `songs` | Updates cannot touch `ownerId`, covers, `playCount`, `playsBySource`, `playsBackground`, or legacy token fields. Create may write `playCount: 0` and null cover fields (TF 15). A non-zero count or a non-null cover is denied |
| `artists` | Client updates cannot change `name`, `nameLowercase`, `ownerId`, `pumpFun`, `x`, `coinMetadataId`, or `coinImagePath`. Rename is `PATCH /api/artists/[id]/name` (Admin). Create may write `pumpFun` only as null or exactly `mint`, `url`, `symbol`, `launchedAt`, `creatorWallet`. `verifiedAt` is rejected. `x` is the disconnected default; `posts` and `recentPostTexts` may be absent or empty |
| `songVersions` | Create requires `audioURL == null` and `providerOutputId == null`. Owner may still change `isPrimary` |
| `generations` | Create requires a pending job, null audio, null or empty stems, and the parent song owned by the caller. `ownerId`, when present, must be the caller. `createdBy` is rejected. No client update or delete |
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
| Wallet link (`solanaWalletAddress` and `email` on `users/{uid}/private/profile`) | `lib/server/usersAdmin.ts` |
| Comments create/update/delete from the API | `lib/server/commentsAdmin.ts` (page `CommentForm` is still a browser client write) |
| Conversations and messages from the API | `lib/server/conversationsAdmin.ts` (`MessageComposer` is still a browser client write) |
| Stub generation status | `lib/server/generationsAdmin.ts` |
| Notifications created by the webhook | `lib/server/notificationsAdmin.ts` |
| Coin launch `pumpFun`, `coinMetadataId`, `coinImagePath` | `lib/services/artistPumpFun.ts` (Admin) |
| Account delete of `users/{uid}`, including `private/profile` | `lib/server/deleteAccount.ts` `recursiveDelete` |
| X tokens and song-live posts | `lib/x/tokens.ts`, `lib/x/postSong.ts` |
| Cover pipeline | `lib/covers/store.ts` |

Browser flows that stay on the client SDK: public Heat / Discover / artist pages, dashboard owner lists, artist and song create, pending generation create, avatar update, display name, version `isPrimary`, comments typed on the page, follow, notification read receipts, chat send from `MessageComposer`, and owner delete of artists, songs, and `users/{uid}`.

## Indexes (`firestore.indexes.json`)

New composites required by the constraints above:

- `artists`: `isPublic ASC`, `deletedAt ASC`, `nameLowercase ASC` (name search and name availability)
- `artists`: `isPublic ASC`, `pumpFun.mint ASC` (mint lookup)

The file also records the song and artist composites the existing public and owner queries already use (Heat `playCount`, Discover `createdAt`, artist-page and feed `artistId`, owner lists), plus the TF 15 reads:

- `songVersions`: `songId ASC`, `versionNumber ASC` (`getSongVersions`)
- `generations`: `songId ASC`, `createdAt DESC` (`getSongGenerations`)
- `generations`: `songVersionId ASC`, `createdAt DESC` (`getSongVersionGenerations` in `lib/services/generations.ts`. Nothing calls it. Rules still deny the query.)
- `conversations`: `participants CONTAINS`, `updatedAt DESC` (`getUserConversations`, `ChatList`)
- `messages`: `conversationId ASC`, `deletedAt ASC`, `createdAt DESC` (`getMessages`, `ChatView`, `adminGetMessages`)
- `notifications`: `songId ASC`, `createdAt DESC` (`getNotificationsBySong`)

TTL field overrides, collection group, field `expireAt`: `coinUploads` and `playRateLimits`. Same policies as #96 and #98.

Comments (`targetType` + `targetId` + `parentCommentId` + `deletedAt` + `createdAt`, and replies `parentCommentId` + `deletedAt` + `createdAt`), follows (`followerId`/`artistId` + `createdAt`), and unread notifications (`userId` + `read` + `createdAt`) are still queried and are not in this file. A prod index export was not available here. Do not deploy indexes until those are reconciled.

## Holes rules do not close

- **Test-mode prod rules** stay in force until this file is deployed. This change does not deploy.
- **Unmigrated user documents** still return `email` and `solanaWalletAddress` on a direct client `get`, because rules cannot hide fields. Web service reads strip them. Run `copy`, then later `strip` (`scripts/migrate-user-private.ts`, not run here) before treating a raw client get as safe. A client `deleteDoc` of `users/{uid}` does not delete `private/profile`. Web `DELETE /api/account` uses `recursiveDelete` and does. Clients cannot write `private/profile`.
- **Artist create may store a launched `pumpFun`.** The map may contain only `mint`, `url`, `symbol`, `launchedAt`, and `creatorWallet`. `verifiedAt` is rejected on create, and updates cannot change `pumpFun`. Follow-up: the next mobile build drops `pumpFun` and `x` from the client create and lets the confirm route own them. Until then a user can attach an arbitrary mint to their own new artist. `coinMetadataId` and `coinImagePath` stay server-only.
- **TF 15 generation create still omits `ownerId`.** Web sends it. Follow-up: the next mobile build adds `ownerId`. The parent song owner stays required, and clients cannot update or delete the job.
- **Song create may write `playCount: 0` and null cover fields.** Follow-up: reject those fields on create once mobile omits them. Updates already cannot change them.
- **Private songs and artists on server-rendered pages** (`app/songs/[id]/page.tsx`, `app/artists/[id]/page.tsx`) call `getSong` / `getArtist` with the client SDK and no user. A private doc fails that read for everyone, including the owner. X connect/pause/disconnect routes have the same `getArtist` gap.
- **`checkArtistNameAvailable`** only sees public artists, so it cannot tell that another user's private artist already has the name. Nothing in the app calls it. `adminUpdateArtistName` still checks every artist.
- **`getLaunchedArtistsByMints`** only returns public artists. It has no callers. An owner listing `ownerId == uid` still sees their private artists.
- **Name-availability fallback** reads up to 1000 public artists if the composite index is missing. It no longer lists the whole collection.
- **Direct-message fallback** still lists every `type == direct` conversation (`conversations.ts`). Rules deny it.
- **`getSongVersionGenerations`** queries `songVersionId` only. Rules cannot prove the parent song, so the query is denied. Nothing calls it.
- **Generation status changes are Admin-only.** The stub path posts to `/api/generations/[id]/status`. Clients cannot update or delete a generation.
- **Song owner updates use a field allow-list.** A future server-owned field that is not in that list will make client title/visibility updates fail until the rules list it and mark it unchanged. `playsBySource` and `playsBackground` are on the list.

## Tests

```bash
pnpm test:rules
```

Uses the Firestore emulator and `@firebase/rules-unit-testing` against `demo-stream-rules`. It does not touch `stream-prod-864df`.
