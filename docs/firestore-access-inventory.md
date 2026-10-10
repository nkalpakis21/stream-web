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

**Held.** `email` and `solanaWalletAddress` stay on `users/{uid}`. `users/{uid}/private/profile` is not implemented. The likely next design (not built, waiting for a go) is the inverse: make `users/{uid}` owner-only, add public `publicProfiles/{uid}` (display name, avatar, other public fields), point other-user reads at that doc, copy fields with a migration, and keep the public doc in sync from the server on profile and avatar updates.

A `get` returns the whole document. Rules cannot hide fields. Public `get` is still allowed, so every read below also receives `email` and `solanaWalletAddress` even when the caller only uses the display name.

Fields on `users/{uid}` (`types/firestore.ts` `UserDocument`):

| Field | Role |
| --- | --- |
| `email` | string |
| `displayName` | string or null |
| `photoURL` | avatar URL, string or null |
| `createdAt`, `updatedAt`, `deletedAt` | timestamps; `deletedAt` null means active |
| `solanaWalletAddress` | optional base58 string or null |

### Reads of another user's doc

The client SDK `get` returns every field. "Uses" is what the caller actually reads off that object.

| Location | Whose doc | Uses | Also returned |
| --- | --- | --- | --- |
| `lib/services/users.ts` `getUser` 31–38 | Any uid passed in | Whole doc, then drops it if `deletedAt` is set | All fields |
| `lib/services/users.ts` `getUserDisplayName` 103–116 | Any uid. Callers below pass other users and sometimes the signed-in user | `displayName`, else the local part of `email` | `photoURL`, `solanaWalletAddress`, timestamps |
| `lib/services/users.ts` `getUsersDisplayNames` 141–143 | Same, one `get` per uid | Display name only (via `getUserDisplayName`) | Same full doc |
| `lib/services/users.ts` `getUsersData` 186–198 | Any uid in the batch | Whole doc if `deletedAt` is null. Map key is `user.id` | All fields, including `email` and `solanaWalletAddress` |
| `lib/services/users.ts` `searchUsersByDisplayName` 233–245 and fallback 263–272 | Other users (optional `excludeUserId`). List on `displayName` prefix and `deletedAt == null` | Whole doc | All fields |
| `lib/services/users.ts` `getUsersFromFollowedArtists` 349–361 | Owners of artists the caller follows, excluding the caller | Whole doc if `deletedAt` is null | All fields |
| `hooks/useUserDisplayName.ts` `useUserDisplayName` 37 | Whatever uid the component passes | Display name string | Full doc inside `getUser` |
| `components/comments/CommentThread.tsx` 44 and 46 | Comment and reply `authorId` (another user, or the signed-in user when they wrote the comment) | Display name via the hooks | Full doc |
| `hooks/useUserDisplayName.ts` `useUsersDisplayNames` 94 | The id list | Display names | Full doc per id |
| `components/chat/ChatList.tsx` 84–90 | Other participants of direct chats (own uid filtered out) | Display name | Full doc |
| `hooks/useUserDisplayName.ts` `useUsersData` 157 | The id list | Full `UserDocument` | All fields |
| `components/chat/ChatView.tsx` 37–39 and 69 | Every message `senderId`, including the signed-in user | At 271: `displayName`, else `email` local-part. At 317: `photoURL` | `solanaWalletAddress` and timestamps |
| `components/chat/ConversationHeader.tsx` 73–83 | Other participants only (own uid skipped at 74) | `displayName`, else full `email` | `photoURL`, `solanaWalletAddress`, timestamps |
| `app/api/users/search/route.ts` 44–52 | Other users. Client SDK from a route handler, so rules see a signed-out caller. No in-app caller of this route | Spreads the full `UserDocument` into JSON | `email` and `solanaWalletAddress` leave the server |
| `app/api/users/followed/route.ts` 26–34 | Other artist owners. Same signed-out client SDK. No in-app caller of this route | Spreads the full `UserDocument` into JSON | `email` and `solanaWalletAddress` leave the server |
| `scripts/migrate-user-documents.ts` `findUniqueDisplayName` 133–150, 179–194, 209–224 | Other users, Admin list on `displayName` | `displayName` and `deletedAt` only, to pick a unique name | Admin can see every field; the script does not copy them |

### Reads of the signed-in user's own doc

| Location | Uses | Notes |
| --- | --- | --- |
| `components/profile/ProfileHeader.tsx` 35–38 | `displayName` via `getUser(user.uid)` | Avatar at 97 and the email line at 163 are Firebase Auth `user.photoURL` and `user.email`, not Firestore |
| `components/profile/ProfileHeader.tsx` 78 | Write, see below | Passes Auth `user.email` into create |
| `components/profile/DisplayNameForm.tsx` 31–34 | `displayName` via `getUser(user.uid)` | Save at 76 does not pass email. The fallback label at 169 is Auth `user.email` |
| `components/bag/BagIdentity.tsx` 31–37 | `displayName` and `photoURL` via `getUser(user.uid)` | Name fallback at 13 is Auth `displayName` / `email`, used until the Firestore read returns |
| `lib/server/deleteAccount.ts` `deleteAccount` 945–960 | Own `email` at 946. `walkStrings` then walks every string on the doc (`displayName`, `photoURL`, `email`, `solanaWalletAddress`) | Admin. Called from `app/api/account/route.ts` 32 with the token uid and Auth email |
| `lib/server/usersAdmin.ts` `adminUpdateUserSolanaWallet` 15 | Existence check before the wallet write | Own doc. Admin |
| `scripts/migrate-user-documents.ts` `createUserDocument` 257–262 | Existence check | Admin. Skips users who already have a doc |

### Writes

| Location | Whose doc | Fields written |
| --- | --- | --- |
| `lib/services/users.ts` `updateUserDisplayName` 77–93 | Own uid. Client SDK | Existing doc: `displayName`, `updatedAt`. Create: `email` (argument or `''`), `displayName`, `photoURL: null`, `createdAt`, `updatedAt`, `deletedAt: null`. No wallet |
| `components/profile/ProfileHeader.tsx` 78 | Own | Calls that update and passes Auth email, so a missing doc is created with `email` |
| `components/profile/DisplayNameForm.tsx` 76 | Own | Same update without an email argument, so a missing doc is created with `email: ''` |
| `lib/server/usersAdmin.ts` 17–34 | Own. Admin | Existing doc: `solanaWalletAddress`, `updatedAt`. Create: `email` (token email or `''`), `displayName: null`, `photoURL: null`, timestamps, `deletedAt: null`, `solanaWalletAddress` |
| `app/api/users/link-wallet/route.ts` 39 | Own | Calls the Admin wallet write with `decodedToken.email` |
| `lib/server/deleteAccount.ts` `deleteAccountIdentity` 804 | Own | `recursiveDelete` of `users/{uid}` (subcollections included). Admin |
| `scripts/migrate-user-documents.ts` 280–287 | Own Auth uid. Admin | Create only: `email`, `displayName`, `photoURL` from Auth, `createdAt`, `updatedAt`, `deletedAt: null`. **Not run** |

No web code updates `photoURL` on an existing user doc. Rules still allow the owner to change `photoURL`. Profile and the menu show the Auth photo. Bag identity prefers Firestore `photoURL` when it is set.

Rules (`firestore.rules` `match /users/{uid}`): public `get`; list only when `displayName` is a string; owner create; owner update of `displayName`, `updatedAt`, `solanaWalletAddress`, `photoURL` (wallet length 32–44 or null); owner cannot change `email`; owner delete.

### Not a Firestore `users/{uid}` read

These use the Firebase Auth user, not the profile document: `components/navigation/UserMenu.tsx` 25–26 and 188 (`displayName`, `email`, `photoURL`); `components/investing/InvestingPageClient.tsx` 311 (Auth `email` for the investor allow-list); `components/profile/ProfileHeader.tsx` 96–97 and 163; `components/profile/DisplayNameForm.tsx` 169; `components/bag/BagIdentity.tsx` 13.

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
| Wallet link (`solanaWalletAddress` and `email` on `users/{uid}`) | `lib/server/usersAdmin.ts` |
| Comments create/update/delete from the API | `lib/server/commentsAdmin.ts` (page `CommentForm` is still a browser client write) |
| Conversations and messages from the API | `lib/server/conversationsAdmin.ts` (`MessageComposer` is still a browser client write) |
| Stub generation status | `lib/server/generationsAdmin.ts` |
| Notifications created by the webhook | `lib/server/notificationsAdmin.ts` |
| Coin launch `pumpFun`, `coinMetadataId`, `coinImagePath` | `lib/services/artistPumpFun.ts` (Admin) |
| Account delete of `users/{uid}` | `lib/server/deleteAccount.ts` `recursiveDelete` |
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
- **`users/{uid}` is still a public `get`.** `email` and `solanaWalletAddress` sit on that doc, so chat, comments, search, and followed-artist reads return them. The `publicProfiles/{uid}` split is inventoried above and not implemented. `scripts/migrate-user-documents.ts` was not run.
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
