#!/usr/bin/env tsx
/**
 * Migration Script: Fix Primary Version Flags
 * 
 * This script ensures all songs have exactly one primary version and that
 * currentVersionId matches the primary version.
 * 
 * Uses Firebase Admin SDK for server-side operations with admin privileges.
 * 
 * Setup:
 *   1. Download service account key from Firebase Console:
 *      Project Settings > Service Accounts > Generate New Private Key
 *   2. Save as `serviceAccountKey.json` in project root (or set FIREBASE_SERVICE_ACCOUNT env var)
 *   3. Or set GOOGLE_APPLICATION_CREDENTIALS env var pointing to the key file
 * 
 * Usage:
 *   Dry run: tsx scripts/migrate-primary-versions.ts --dry-run
 *   Execute: tsx scripts/migrate-primary-versions.ts
 */

import * as admin from 'firebase-admin';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Option 1: Use service account JSON from environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✓ Initialized Firebase Admin with FIREBASE_SERVICE_ACCOUNT env var');
    }
    // Option 2: Use GOOGLE_APPLICATION_CREDENTIALS environment variable
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('✓ Initialized Firebase Admin with GOOGLE_APPLICATION_CREDENTIALS');
    }
    // Option 3: Look for serviceAccountKey.json in project root
    else {
      const serviceAccountPath = resolve(process.cwd(), 'serviceAccountKey.json');
      if (existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('✓ Initialized Firebase Admin with serviceAccountKey.json');
      } else {
        throw new Error(
          'Firebase Admin SDK not initialized. Please provide one of:\n' +
          '  - FIREBASE_SERVICE_ACCOUNT env var (JSON string)\n' +
          '  - GOOGLE_APPLICATION_CREDENTIALS env var (path to key file)\n' +
          '  - serviceAccountKey.json file in project root'
        );
      }
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    process.exit(1);
  }
}

const db = admin.firestore();

interface MigrationStats {
  totalSongs: number;
  processedSongs: number;
  fixedSongs: number;
  skippedSongs: number;
  errors: Array<{ songId: string; error: string }>;
  issues: Array<{ songId: string; issues: string[]; actionTaken: string | null }>;
}

interface SongDocument {
  id: string;
  ownerId: string;
  artistId: string;
  artistVersionId: string;
  title: string;
  isPublic: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  deletedAt: admin.firestore.Timestamp | null;
  currentVersionId: string;
  parentSongId: string | null;
  collaborationType: string | null;
  albumCoverPath: string | null;
  albumCoverThumbnail: string | null;
  playCount?: number;
}

interface SongVersionDocument {
  id: string;
  songId: string;
  versionNumber: number;
  title: string;
  createdBy: string;
  createdAt: admin.firestore.Timestamp;
  parentVersionId: string | null;
  audioURL: string | null;
  providerOutputId: string | null;
  isPrimary: boolean;
}

/**
 * Fix primary version consistency for a song using Admin SDK
 */
async function fixPrimaryVersionConsistency(
  songId: string,
  song: SongDocument,
  versions: SongVersionDocument[],
  dryRun: boolean
): Promise<{ fixed: boolean; issues: string[]; actionTaken: string | null }> {
  if (versions.length === 0) {
    return {
      fixed: false,
      issues: ['No versions found'],
      actionTaken: null,
    };
  }

  const primaryVersions = versions.filter(v => v.isPrimary);
  const issues: string[] = [];
  let actionTaken: string | null = null;

  // Check for issues
  if (primaryVersions.length === 0) {
    issues.push('No primary version found');
  } else if (primaryVersions.length > 1) {
    issues.push(`Multiple primary versions found (${primaryVersions.length})`);
  }

  const currentPrimary = primaryVersions.find(v => v.id === song.currentVersionId);
  if (!currentPrimary && primaryVersions.length > 0) {
    issues.push('currentVersionId does not match primary version');
  }

  // If no issues, return early
  if (issues.length === 0) {
    return {
      fixed: false,
      issues: [],
      actionTaken: null,
    };
  }

  // Determine target version
  let targetVersionId: string;
  if (primaryVersions.length === 0) {
    // No primary: use currentVersionId if valid, else first version
    const currentVersion = versions.find(v => v.id === song.currentVersionId);
    targetVersionId = currentVersion?.id || versions[0].id;
    actionTaken = `Set version ${targetVersionId} as primary (no primary existed)`;
  } else if (primaryVersions.length > 1) {
    // Multiple primaries: keep one matching currentVersionId, or oldest
    const matchingCurrent = primaryVersions.find(v => v.id === song.currentVersionId);
    targetVersionId = matchingCurrent?.id || primaryVersions[0].id;
    actionTaken = `Fixed multiple primaries, kept version ${targetVersionId}`;
  } else {
    // One primary but currentVersionId mismatch
    targetVersionId = primaryVersions[0].id;
    actionTaken = `Updated currentVersionId to match primary version`;
  }

  if (dryRun) {
    return {
      fixed: true,
      issues,
      actionTaken: `Would ${actionTaken}`,
    };
  }

  // Apply fixes using batch write
  const batch = db.batch();

  // Update all versions
  versions.forEach(version => {
    const versionRef = db.collection('songVersions').doc(version.id);
    batch.update(versionRef, { isPrimary: version.id === targetVersionId });
  });

  // Update song currentVersionId if needed
  if (song.currentVersionId !== targetVersionId) {
    const songRef = db.collection('songs').doc(songId);
    batch.update(songRef, {
      currentVersionId: targetVersionId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    fixed: true,
    issues,
    actionTaken,
  };
}

async function migratePrimaryVersions(dryRun: boolean = false): Promise<void> {
  console.log('='.repeat(60));
  console.log('Primary Version Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  console.log(`Project: ${admin.app().options.projectId || 'unknown'}`);
  console.log('');

  const stats: MigrationStats = {
    totalSongs: 0,
    processedSongs: 0,
    fixedSongs: 0,
    skippedSongs: 0,
    errors: [],
    issues: [],
  };

  try {
    // Fetch all non-deleted songs
    console.log('Fetching all songs...');
    const songsSnapshot = await db
      .collection('songs')
      .where('deletedAt', '==', null)
      .get();
    
    stats.totalSongs = songsSnapshot.size;
    console.log(`Found ${stats.totalSongs} songs to process\n`);

    if (stats.totalSongs === 0) {
      console.log('No songs to process. Exiting.');
      return;
    }

    // Process songs in batches
    const batchSize = 50;
    const songs = songsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data() as SongDocument,
    }));

    for (let i = 0; i < songs.length; i += batchSize) {
      const batch = songs.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(songs.length / batchSize)} (songs ${i + 1}-${Math.min(i + batchSize, songs.length)})...`);

      for (const { id: songId, data: song } of batch) {
        try {
          // Get all versions for this song
          const versionsSnapshot = await db
            .collection('songVersions')
            .where('songId', '==', songId)
            .get();

          if (versionsSnapshot.empty) {
            stats.skippedSongs++;
            continue;
          }

          const versions = versionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as SongVersionDocument[];

          // Check if fixes are needed and apply them
          const result = await fixPrimaryVersionConsistency(songId, song, versions, dryRun);
          
          if (result.fixed) {
            stats.fixedSongs++;
            stats.issues.push({
              songId,
              issues: result.issues,
              actionTaken: result.actionTaken,
            });
            if (!dryRun) {
              console.log(`  ✓ Fixed song ${songId}: ${result.actionTaken}`);
            }
          }

          stats.processedSongs++;
        } catch (error) {
          stats.errors.push({
            songId,
            error: error instanceof Error ? error.message : String(error),
          });
          console.error(`  ✗ Error processing song ${songId}:`, error);
        }
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total songs: ${stats.totalSongs}`);
    console.log(`Processed: ${stats.processedSongs}`);
    console.log(`Fixed: ${stats.fixedSongs}`);
    console.log(`Skipped (no versions): ${stats.skippedSongs}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.issues.length > 0) {
      console.log('\nIssues Fixed:');
      stats.issues.slice(0, 20).forEach(({ songId, issues, actionTaken }) => {
        console.log(`  Song ${songId}:`);
        console.log(`    Issues: ${issues.join(', ')}`);
        console.log(`    Action: ${actionTaken}`);
      });
      if (stats.issues.length > 20) {
        console.log(`  ... and ${stats.issues.length - 20} more`);
      }
    }

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(({ songId, error }) => {
        console.log(`  Song ${songId}: ${error}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    if (dryRun) {
      console.log('DRY RUN COMPLETE - No changes were made');
      console.log('Run without --dry-run to apply changes');
    } else {
      console.log('MIGRATION COMPLETE');
    }
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Fatal error during migration:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');

// Run migration
migratePrimaryVersions(dryRun)
  .then(() => {
    console.log('\nMigration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
