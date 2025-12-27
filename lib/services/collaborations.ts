/**
 * Collaboration Service
 * 
 * Tracks collaboration relationships between songs.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  COLLECTIONS,
  getCollaborationPath,
} from '@/lib/firebase/collections';
import type { CollaborationDocument, CollaborationType } from '@/types/firestore';

/**
 * Create a collaboration record
 */
export async function createCollaboration(
  data: {
    type: CollaborationType;
    sourceSongId: string;
    targetSongId: string;
    collaboratorId: string;
    notes?: string | null;
  }
): Promise<CollaborationDocument> {
  const collaborationRef = doc(collection(db, COLLECTIONS.collaborations));
  const collaborationId = collaborationRef.id;

  const collaboration: CollaborationDocument = {
    id: collaborationId,
    type: data.type,
    sourceSongId: data.sourceSongId,
    targetSongId: data.targetSongId,
    collaboratorId: data.collaboratorId,
    notes: data.notes || null,
    createdAt: Timestamp.now(),
  };

  await setDoc(collaborationRef, collaboration);

  return collaboration;
}

/**
 * Get a collaboration by ID
 */
export async function getCollaboration(
  collaborationId: string
): Promise<CollaborationDocument | null> {
  const collaborationRef = doc(db, getCollaborationPath(collaborationId));
  const snapshot = await getDoc(collaborationRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as CollaborationDocument;
}

/**
 * Get all collaborations for a song (as source)
 */
export async function getSongCollaborations(
  songId: string
): Promise<CollaborationDocument[]> {
  const q = query(
    collection(db, COLLECTIONS.collaborations),
    where('sourceSongId', '==', songId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data() as CollaborationDocument);
}

/**
 * Get collaboration lineage (all songs derived from a source)
 */
export async function getCollaborationLineage(
  sourceSongId: string
): Promise<CollaborationDocument[]> {
  // Get all direct collaborations
  const direct = await getSongCollaborations(sourceSongId);
  
  // Recursively get collaborations from derived songs
  const all: CollaborationDocument[] = [...direct];
  
  for (const collab of direct) {
    const derived = await getCollaborationLineage(collab.targetSongId);
    all.push(...derived);
  }
  
  return all;
}


