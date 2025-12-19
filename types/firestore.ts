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

export interface AIArtistDocument {
  id: string;
  ownerId: string; // User ID
  name: string;
  avatarURL: string | null;
  styleDNA: StyleDNA;
  lore: string; // Bio/backstory
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  currentVersionId: string; // Latest version ID
}

export interface AIArtistVersionDocument {
  id: string;
  artistId: string; // Parent artist ID
  versionNumber: number; // Incremental version
  name: string;
  avatarURL: string | null;
  styleDNA: StyleDNA;
  lore: string;
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
// Notifications
// ============================================================================

export type NotificationType = 'song_ready';

export interface NotificationDocument {
  id: string;
  userId: string;
  type: NotificationType;
  songId: string;
  generationId: string;
  read: boolean;
  createdAt: Timestamp;
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

