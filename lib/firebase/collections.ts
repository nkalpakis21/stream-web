/**
 * Firestore Collection Paths
 * 
 * Centralized collection path definitions to ensure consistency
 * and make refactoring easier.
 */

export const COLLECTIONS = {
  users: 'users',
  artists: 'artists',
  artistVersions: 'artistVersions',
  songs: 'songs',
  songVersions: 'songVersions',
  generations: 'generations',
  collaborations: 'collaborations',
  notifications: 'notifications',
  follows: 'follows',
  conversations: 'conversations',
  messages: 'messages',
  comments: 'comments',
  /**
   * Server-only X OAuth tokens keyed by artistId.
   * Client SDK must never read this collection (rules deny all).
   */
  artistXAuth: 'artistXAuth',
  /**
   * Idempotency records for song-live X posts. Keyed by songId.
   * Server-only (rules deny all).
   */
  xSongPosts: 'xSongPosts',
  /**
   * Anonymous play-count rate limits. Doc ids are HMACs, never raw IPs.
   * Server-only. Enable a Firestore TTL policy on field `expireAt`.
   */
  playRateLimits: 'playRateLimits',
  /**
   * Parent for pump.fun metadata uploads. Each upload is
   * coinMetadataUploads/{uid}/coinUploads/{id} with expireAt (now + 24h).
   * Admin SDK only. Firestore TTL on collection group `coinUploads`.
   */
  coinMetadataUploads: 'coinMetadataUploads',
  /**
   * Server-only binding from a MusicGPT task id to the uid that started it.
   * Doc id is the provider task id. `songId` is null when the client did not
   * send one (older mobile). Admin SDK only. `expireAt` is now + 7 days.
   * Firestore TTL is the musicgptTasks field override in firestore.indexes.json.
   */
  musicgptTasks: 'musicgptTasks',
  /**
   * Mint bound to the uid that asked create-tx to build it.
   * Admin SDK only. Clients cannot read or write this collection.
   * Account delete overwrites this user's docs with `{ deletedAt }` and
   * removes uid and creatorWallet. The doc is not deleted.
   */
  coinMints: 'coinMints',
  /**
   * Content reports filed through POST /api/reports.
   * Clients may create their own report. They cannot read, update, or delete.
   */
  reports: 'reports',
  /**
   * Per-reporter hourly cap for POST /api/reports. Doc id is the reporter uid.
   * Admin SDK only.
   */
  reportRateLimits: 'reportRateLimits',
  /**
   * Owner-only block list at blocks/{uid}.
   * { blockedUids: list, updatedAt: Timestamp }, at most BLOCKED_UIDS_MAX entries.
   * The signed-in user reads and writes this doc and filters songs and artists locally.
   */
  blocks: 'blocks',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

/**
 * Max entries in blocks/{uid}.blockedUids.
 * Rules allow a list of this size. They do not check every element:
 * a per-element string check of 500 indexes does not fit the rules
 * expression budget. Keep this in sync with firestore.rules.
 */
export const BLOCKED_UIDS_MAX = 500;

/**
 * Helper functions to build document paths
 */
export const getCollectionPath = (collection: CollectionName): string => {
  return collection;
};

export const getUserPath = (userId: string): string => {
  return `${COLLECTIONS.users}/${userId}`;
};

/** Owner-only email and wallet. Not readable from the public user document. */
export const getUserPrivateProfilePath = (userId: string): string => {
  return `${COLLECTIONS.users}/${userId}/private/profile`;
};

export const getArtistPath = (artistId: string): string => {
  return `${COLLECTIONS.artists}/${artistId}`;
};

export const getArtistVersionPath = (versionId: string): string => {
  return `${COLLECTIONS.artistVersions}/${versionId}`;
};

export const getSongPath = (songId: string): string => {
  return `${COLLECTIONS.songs}/${songId}`;
};

export const getSongVersionPath = (versionId: string): string => {
  return `${COLLECTIONS.songVersions}/${versionId}`;
};

export const getGenerationPath = (generationId: string): string => {
  return `${COLLECTIONS.generations}/${generationId}`;
};

export const getCollaborationPath = (collaborationId: string): string => {
  return `${COLLECTIONS.collaborations}/${collaborationId}`;
};

export const getNotificationPath = (notificationId: string): string => {
  return `${COLLECTIONS.notifications}/${notificationId}`;
};

export const getFollowPath = (followId: string): string => {
  return `${COLLECTIONS.follows}/${followId}`;
};

export const getConversationPath = (conversationId: string): string => {
  return `${COLLECTIONS.conversations}/${conversationId}`;
};

export const getMessagePath = (messageId: string): string => {
  return `${COLLECTIONS.messages}/${messageId}`;
};

export const getCommentPath = (commentId: string): string => {
  return `${COLLECTIONS.comments}/${commentId}`;
};