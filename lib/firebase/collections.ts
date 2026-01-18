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
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

/**
 * Helper functions to build document paths
 */
export const getCollectionPath = (collection: CollectionName): string => {
  return collection;
};

export const getUserPath = (userId: string): string => {
  return `${COLLECTIONS.users}/${userId}`;
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
