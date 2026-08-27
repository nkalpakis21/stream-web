import { Timestamp } from 'firebase/firestore';

/**
 * Firestore Schema Types
 * 
 * All timestamps use Firestore Timestamp type.
 * All IDs are immutable strings.
 * All versions are immutable and reference their parent.
 */

// ============================================================================
// User
// ============================================================================

export interface UserDocument {
  id: string; // Firestore document ID
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null; // Soft delete
  /** Linked Solana wallet address (base58). Set when user connects and links wallet. */
  solanaWalletAddress?: string | null;
}

// ============================================================================
// AI Artist
// ============================================================================

export interface StyleDNA {
  genres: string[]; // e.g., ["jazz", "cyberpunk", "electronic"]
  moods: string[]; // e.g., ["melancholic", "energetic", "dreamy"]
  tempoRange: {
    min: number; // BPM
    max: number; // BPM
  };
  influences: string[]; // e.g., ["Miles Davis", "Daft Punk"]
}

/**
 * Optional artist-level pump.fun coin. All fields are nullable: an artist
 * can exist with no token. Absent/undefined on older documents is equivalent
 * to an unlaunched coin.
 */
export interface PumpFunCoin {
  mint: string | null;
  url: string | null;
  symbol: string | null;
  launchedAt: Timestamp | null;
  creatorWallet: string | null;
}

export function emptyPumpFunCoin(): PumpFunCoin {
  return {
    mint: null,
    url: null,
    symbol: null,
    launchedAt: null,
    creatorWallet: null,
  };
}

/**
 * Public (non-secret) X connection state for an artist.
 * Access/refresh tokens are NOT stored here — see artistXAuth (Admin SDK only).
 */
export type XConnectionStatus = 'disconnected' | 'connected' | 'paused';

export interface XPostLogEntry {
  tweetId: string;
  url: string;
  songId: string;
  songTitle: string;
  text: string;
  createdAt: Timestamp;
}

export interface XConnectionPublic {
  status: XConnectionStatus;
  /** X handle without @. Null until OAuth completes. */
  username: string | null;
  /** X numeric user id. */
  userId: string | null;
  connectedAt: Timestamp | null;
  pausedAt: Timestamp | null;
  /** Human-readable reason posting was paused (auth, spam, rate limit). */
  lastError: string | null;
  lastErrorAt: Timestamp | null;
  /** Set once after a successful name/bio/avatar sync on connect. */
  profileSyncedAt: Timestamp | null;
  /** Last ~20 post bodies so we do not repeat copy. */
  recentPostTexts: string[];
  /** Activity log of posts we made (newest first, capped). */
  posts: XPostLogEntry[];
}

export function emptyXConnection(): XConnectionPublic {
  return {
    status: 'disconnected',
    username: null,
    userId: null,
    connectedAt: null,
    pausedAt: null,
    lastError: null,
    lastErrorAt: null,
    profileSyncedAt: null,
    recentPostTexts: [],
    posts: [],
  };
}

export interface AIArtistDocument {
  id: string;
  ownerId: string; // User ID
  name: string;
  nameLowercase: string; // Lowercase version for case-insensitive uniqueness checks
  avatarURL: string | null;
  styleDNA: StyleDNA;
  lore: string; // Bio/backstory
  /**
   * Locked vocal/style identity sent to MusicGPT as `music_style` on every song.
   * MusicGPT MusicAI has no persistent voice_id/clone on our endpoint; this text
   * is the consistency lock until that exists. Optional for older artists.
   */
  vocalIdentity?: string | null;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  currentVersionId: string; // Latest version ID
  /**
   * Artist-level pump.fun coin. Null/empty when the artist was created
   * without launching a coin (the default).
   */
  pumpFun?: PumpFunCoin | null;
  /**
   * Optional public X account for this artist. Absent/undefined on older
   * documents is equivalent to disconnected. Tokens are never stored here.
   */
  x?: XConnectionPublic | null;
}

export interface AIArtistVersionDocument {
  id: string;
  artistId: string; // Parent artist ID
  versionNumber: number; // Incremental version
  name: string;
  avatarURL: string | null;
  styleDNA: StyleDNA;
  lore: string;
  /** Locked vocal/style identity; copied from the artist. Optional for older versions. */
  vocalIdentity?: string | null;
  createdBy: string; // User ID
  createdAt: Timestamp;
  parentVersionId: string | null; // Previous version ID (null for v1)
  // Immutable - never changes after creation
}

// ============================================================================
// Song
// ============================================================================

export type CollaborationType = 'fork' | 'remix' | 'response' | 'extension';

export interface SongDocument {
  id: string;
  ownerId: string; // User ID
  artistId: string; // AI Artist ID
  artistVersionId: string; // Specific artist version used
  title: string;
  isPublic: boolean; // Public by default
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  currentVersionId: string; // Latest version ID
  parentSongId: string | null; // If forked/remixed, reference original
  collaborationType: CollaborationType | null; // Type of collaboration if applicable
  /**
   * Album cover image URL (full size).
   * Shared across all conversions for a single song generation.
   */
  albumCoverPath: string | null;
  /**
   * Album cover thumbnail URL.
   * Shared across all conversions for a single song generation.
   */
  albumCoverThumbnail: string | null;
  /**
   * Total number of times this song has been played.
   * Incremented atomically when users play the song.
   * Optional for backward compatibility with existing songs.
   */
  playCount?: number;
  /**
   * Legacy per-song Metaplex mint address. Kept so existing documents still
   * load. New tokens are artist-level via pump.fun; do not mint new song tokens.
   */
  tokenMintAddress?: string | null;
  /**
   * When the legacy song token was created. Kept for existing rows.
   */
  tokenMintCreatedAt?: Timestamp | null;
}

export interface SongVersionDocument {
  id: string;
  songId: string; // Parent song ID
  versionNumber: number;
  title: string;
  createdBy: string; // User ID
  createdAt: Timestamp;
  parentVersionId: string | null; // Previous version ID (null for v1)
  /**
   * URL to the generated audio for this specific version.
   * Once set, this must never be mutated.
   */
  audioURL: string | null;
  /**
   * Provider-specific identifier for this output.
   * Used for idempotency in webhook handlers.
   */
  providerOutputId: string | null;
  /**
   * Whether this version is currently the primary / canonical version
   * for the parent song. Only one version per song should have this set
   * to true at any given time.
   */
  isPrimary: boolean;
  // Other fields are immutable once created, but isPrimary may change.
}

// ============================================================================
// Generation
// ============================================================================

export interface GenerationParameters {
  duration?: number; // Seconds
  quality?: 'low' | 'medium' | 'high';
  [key: string]: unknown; // Extensible for provider-specific params
}

export interface GenerationDocument {
  id: string;
  /**
   * Parent song this generation was requested for.
   * All versions created from this generation will share this songId.
   */
  songId: string;
  /**
   * Artist version used as context for this generation.
   */
  artistVersionId: string;
  /**
   * Optional link to a specific song version.
   * For legacy flows that generated directly into a single version.
   */
  songVersionId: string | null;
  prompt: {
    structured: Record<string, unknown>; // Structured prompt data
    freeText: string; // Free-form prompt text
  };
  parameters: GenerationParameters;
  provider: string; // AI provider identifier (e.g., "openai", "stability")
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /**
   * Provider-side task / job identifier.
   * Used to correlate asynchronous webhooks with this generation.
   */
  providerTaskId: string | null;
  /**
   * Provider-side conversion identifiers (e.g., conversion_id_1, conversion_id_2 from MusicGPT).
   * Each conversion_id corresponds to a variation of the generated content.
   */
  providerConversionIds: string[] | null;
  /**
   * Track which conversion_ids have been processed via webhooks.
   * Used for idempotency and to determine when generation is fully complete.
   */
  providerProcessedConversions: string[];
  output: {
    audioURL: string | null; // Main audio file
    stems: string[] | null; // Individual stem URLs if available
    metadata: Record<string, unknown>; // Provider-specific metadata
  };
  error: string | null;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  // Hash for proof-ready ownership (can be minted on-chain later)
  contentHash: string | null; // Hash of prompt + output references
}

// ============================================================================
// Collaboration
// ============================================================================

export interface CollaborationDocument {
  id: string;
  type: CollaborationType;
  sourceSongId: string; // Original song
  targetSongId: string; // New song created from collaboration
  collaboratorId: string; // User who created the collaboration
  notes: string | null; // Optional collaboration notes
  createdAt: Timestamp;
  // Tracks the lineage: sourceSongId -> targetSongId
}

// ============================================================================
// Follows
// ============================================================================

export interface FollowDocument {
  id: string;
  followerId: string; // User ID
  artistId: string; // AI Artist ID
  createdAt: Timestamp;
}

// ============================================================================
// Notifications
// ============================================================================

export type NotificationType = 'song_ready' | 'artist_new_song';

export interface NotificationDocument {
  id: string;
  userId: string;
  type: NotificationType;
  songId: string;
  generationId: string;
  read: boolean;
  createdAt: Timestamp;
  deletedAt: Timestamp | null; // Soft delete
}

// ============================================================================
// Chat
// ============================================================================

export interface ConversationDocument {
  id: string;
  type: 'direct' | 'group';
  participants: string[]; // User IDs (for backward compatibility and message routing)
  artistId?: string; // Artist ID (required for direct conversations with artists)
  ownerId?: string; // User ID who owns the artist (for grouping conversations)
  createdBy?: string; // User ID of the conversation creator
  title?: string; // Custom title for group chats (optional)
  artistIds?: string[]; // Array of artist IDs in the conversation (for group chats with multiple artists)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt: Timestamp | null;
  lastMessagePreview: string | null;
}

export interface MessageDocument {
  id: string;
  conversationId: string;
  senderId: string; // User ID
  content: string;
  createdAt: Timestamp;
  readBy: string[]; // User IDs who have read
  deletedAt: Timestamp | null;
}

// ============================================================================
// Comments
// ============================================================================

export interface CommentDocument {
  id: string;
  targetType: 'artist' | 'song';
  targetId: string; // Artist ID or Song ID
  authorId: string; // User ID
  content: string;
  parentCommentId: string | null; // For nested replies
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

// ============================================================================
// Discovery & Metadata
// ============================================================================

export interface DiscoveryQuery {
  prompt?: string; // Free-text search
  artistId?: string;
  genres?: string[];
  moods?: string[];
  userId?: string;
  limit?: number;
  offset?: number;
}

