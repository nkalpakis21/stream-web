#!/usr/bin/env tsx
/**
 * Migration Script: Create User Documents
 * 
 * This script creates Firestore user documents for all Firebase Auth users
 * who don't already have one. This ensures users appear in search results.
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
 *   Dry run: tsx scripts/migrate-user-documents.ts --dry-run
 *   Execute: tsx scripts/migrate-user-documents.ts
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
const auth = admin.auth();

interface MigrationStats {
  totalAuthUsers: number;
  usersWithDocuments: number;
  usersCreated: number;
  displayNameConflicts: number;
  errors: Array<{ userId: string; email: string; error: string }>;
}

interface UserDocument {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  deletedAt: admin.firestore.Timestamp | null;
}

/**
 * Extract email prefix (part before @) and sanitize for display name
 */
function extractEmailPrefix(email: string): string {
  const prefix = email.split('@')[0];
  // Remove invalid characters, keep only alphanumeric, spaces, hyphens, underscores
  return prefix.replace(/[^a-zA-Z0-9\s\-_]/g, '');
}

/**
 * Validate display name according to rules
 */
function isValidDisplayName(name: string): boolean {
  if (name.length < 2 || name.length > 30) {
    return false;
  }
  const allowedPattern = /^[a-zA-Z0-9\s\-_]+$/;
  return allowedPattern.test(name);
}

/**
 * Find a unique display name by checking Firestore and appending numbers if needed
 */
async function findUniqueDisplayName(
  baseName: string,
  excludeUserId?: string
): Promise<string> {
  // If base name is invalid, use fallback
  if (!isValidDisplayName(baseName)) {
    // Try to clean it up
    const cleaned = baseName.trim().substring(0, 30);
    if (!isValidDisplayName(cleaned)) {
      // Use a fallback based on first 8 chars + random suffix
      baseName = `user_${baseName.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '')}`;
      if (!isValidDisplayName(baseName)) {
        baseName = 'user';
      }
    } else {
      baseName = cleaned;
    }
  }

  // Check if base name is available
  let baseDocs: admin.firestore.QueryDocumentSnapshot[];
  try {
    const baseQuery = db
      .collection('users')
      .where('displayName', '==', baseName)
      .where('deletedAt', '==', null)
      .limit(1);
    const baseSnapshot = await baseQuery.get();
    baseDocs = baseSnapshot.docs;
  } catch (error: any) {
    // Fallback if composite index doesn't exist - query without deletedAt filter
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      const fallbackQuery = db
        .collection('users')
        .where('displayName', '==', baseName)
        .limit(10);
      const fallbackSnapshot = await fallbackQuery.get();
      // Filter out deleted users in memory
      baseDocs = fallbackSnapshot.docs.filter(
        doc => !doc.data().deletedAt
      );
    } else {
      throw error;
    }
  }
  
  // Check if any result is not the current user
  const hasConflict = baseDocs.some(
    doc => doc.id !== excludeUserId
  );

  if (!hasConflict) {
    return baseName;
  }

  // Try appending numbers
  for (let i = 2; i <= 9999; i++) {
    const candidate = `${baseName}${i}`;
    if (candidate.length > 30) {
      // If appending number makes it too long, truncate base name
      const truncatedBase = baseName.substring(0, 30 - String(i).length);
      const candidate2 = `${truncatedBase}${i}`;
      if (!isValidDisplayName(candidate2)) {
        break;
      }
      
      let candidateDocs: admin.firestore.QueryDocumentSnapshot[];
      try {
        const query = db
          .collection('users')
          .where('displayName', '==', candidate2)
          .where('deletedAt', '==', null)
          .limit(1);
        const snapshot = await query.get();
        candidateDocs = snapshot.docs;
      } catch (error: any) {
        // Fallback if composite index doesn't exist
        if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
          const fallbackQuery = db
            .collection('users')
            .where('displayName', '==', candidate2)
            .limit(10);
          const fallbackSnapshot = await fallbackQuery.get();
          candidateDocs = fallbackSnapshot.docs.filter(doc => !doc.data().deletedAt);
        } else {
          throw error;
        }
      }
      
      const hasConflict2 = candidateDocs.some(doc => doc.id !== excludeUserId);
      
      if (!hasConflict2) {
        return candidate2;
      }
    } else {
      let candidateDocs: admin.firestore.QueryDocumentSnapshot[];
      try {
        const query = db
          .collection('users')
          .where('displayName', '==', candidate)
          .where('deletedAt', '==', null)
          .limit(1);
        const snapshot = await query.get();
        candidateDocs = snapshot.docs;
      } catch (error: any) {
        // Fallback if composite index doesn't exist
        if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
          const fallbackQuery = db
            .collection('users')
            .where('displayName', '==', candidate)
            .limit(10);
          const fallbackSnapshot = await fallbackQuery.get();
          candidateDocs = fallbackSnapshot.docs.filter(doc => !doc.data().deletedAt);
        } else {
          throw error;
        }
      }
      
      const hasConflict2 = candidateDocs.some(doc => doc.id !== excludeUserId);
      
      if (!hasConflict2) {
        return candidate;
      }
    }
  }

  // Fallback: use base name with timestamp suffix
  const timestamp = Date.now().toString().slice(-6);
  return `${baseName.substring(0, 24)}${timestamp}`;
}

/**
 * Create user document for a Firebase Auth user
 */
async function createUserDocument(
  authUser: admin.auth.UserRecord,
  dryRun: boolean
): Promise<{ created: boolean; displayName: string | null; conflict: boolean }> {
  const userId = authUser.uid;
  const email = authUser.email;

  if (!email) {
    throw new Error('User has no email address');
  }

  // Check if document already exists
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    return { created: false, displayName: null, conflict: false };
  }

  // Extract email prefix for display name
  const emailPrefix = extractEmailPrefix(email);
  const displayName = await findUniqueDisplayName(emailPrefix, userId);
  const hadConflict = displayName !== emailPrefix;

  // Get creation time from Firebase Auth metadata
  let createdAt: admin.firestore.Timestamp;
  if (authUser.metadata.creationTime) {
    createdAt = admin.firestore.Timestamp.fromDate(
      new Date(authUser.metadata.creationTime)
    );
  } else {
    createdAt = admin.firestore.Timestamp.now();
  }

  if (!dryRun) {
    await userRef.set({
      email: email,
      displayName: displayName,
      photoURL: authUser.photoURL || null,
      createdAt: createdAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedAt: null,
    });
  }

  return { created: true, displayName, conflict: hadConflict };
}

async function migrateUserDocuments(dryRun: boolean = false): Promise<void> {
  console.log('='.repeat(60));
  console.log('User Documents Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  console.log(`Project: ${admin.app().options.projectId || 'unknown'}`);
  console.log('');

  const stats: MigrationStats = {
    totalAuthUsers: 0,
    usersWithDocuments: 0,
    usersCreated: 0,
    displayNameConflicts: 0,
    errors: [],
  };

  try {
    // List all Firebase Auth users (handle pagination)
    console.log('Fetching all Firebase Auth users...');
    let nextPageToken: string | undefined;
    const allAuthUsers: admin.auth.UserRecord[] = [];

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      allAuthUsers.push(...listUsersResult.users);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    stats.totalAuthUsers = allAuthUsers.length;
    console.log(`Found ${stats.totalAuthUsers} Firebase Auth users\n`);

    if (stats.totalAuthUsers === 0) {
      console.log('No users to process. Exiting.');
      return;
    }

    // Process users
    console.log('Processing users...\n');
    for (let i = 0; i < allAuthUsers.length; i++) {
      const authUser = allAuthUsers[i];
      const progress = `[${i + 1}/${stats.totalAuthUsers}]`;

      try {
        const result = await createUserDocument(authUser, dryRun);

        if (!result.created) {
          stats.usersWithDocuments++;
          if ((i + 1) % 50 === 0 || i === allAuthUsers.length - 1) {
            console.log(`${progress} User ${authUser.email} already has document`);
          }
        } else {
          stats.usersCreated++;
          if (result.conflict) {
            stats.displayNameConflicts++;
          }
          if (!dryRun) {
            console.log(
              `${progress} ✓ Created document for ${authUser.email}${result.conflict ? ` (display name: ${result.displayName})` : ''}`
            );
          } else {
            console.log(
              `${progress} Would create document for ${authUser.email}${result.conflict ? ` (display name: ${result.displayName})` : ''}`
            );
          }
        }
      } catch (error) {
        stats.errors.push({
          userId: authUser.uid,
          email: authUser.email || 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`${progress} ✗ Error processing user ${authUser.email}:`, error);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total Firebase Auth users: ${stats.totalAuthUsers}`);
    console.log(`Users with existing documents: ${stats.usersWithDocuments}`);
    console.log(`Users ${dryRun ? 'would be ' : ''}created: ${stats.usersCreated}`);
    console.log(`Display name conflicts resolved: ${stats.displayNameConflicts}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.slice(0, 20).forEach(({ userId, email, error }) => {
        console.log(`  User ${email} (${userId}): ${error}`);
      });
      if (stats.errors.length > 20) {
        console.log(`  ... and ${stats.errors.length - 20} more`);
      }
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
migrateUserDocuments(dryRun)
  .then(() => {
    console.log('\nMigration script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
