#!/usr/bin/env tsx
/**
 * One-time migration: move email and solanaWalletAddress off users/{uid}
 * onto users/{uid}/private/profile, then delete them from the public doc.
 *
 * Not invoked by the app, CI, or deploy. Run it by hand after the rules
 * that reject those public fields are ready.
 *
 * Setup matches scripts/migrate-user-documents.ts (service account).
 *
 * Usage:
 *   Dry run: tsx scripts/migrate-user-private.ts --dry-run
 *   Execute: tsx scripts/migrate-user-private.ts
 */

import * as admin from 'firebase-admin';
import { existsSync } from 'fs';
import { resolve } from 'path';

const PRIVATE_FIELDS = ['email', 'solanaWalletAddress'] as const;

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✓ Initialized Firebase Admin with FIREBASE_SERVICE_ACCOUNT env var');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('✓ Initialized Firebase Admin with GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      const serviceAccountPath = resolve(process.cwd(), 'serviceAccountKey.json');
      if (!existsSync(serviceAccountPath)) {
        throw new Error(
          'Firebase Admin SDK not initialized. Please provide one of:\n' +
            '  - FIREBASE_SERVICE_ACCOUNT env var (JSON string)\n' +
            '  - GOOGLE_APPLICATION_CREDENTIALS env var (path to key file)\n' +
            '  - serviceAccountKey.json file in project root'
        );
      }
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✓ Initialized Firebase Admin with serviceAccountKey.json');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    process.exit(1);
  }
}

const db = admin.firestore();

function privatePayload(data: admin.firestore.DocumentData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (typeof data.email === 'string') payload.email = data.email;
  if (typeof data.solanaWalletAddress === 'string' || data.solanaWalletAddress === null) {
    payload.solanaWalletAddress = data.solanaWalletAddress;
  }
  return payload;
}

export function publicDocHasPrivateFields(data: admin.firestore.DocumentData | undefined): boolean {
  if (!data) return false;
  return PRIVATE_FIELDS.some(field => Object.prototype.hasOwnProperty.call(data, field));
}

async function migrateUserPrivate(dryRun: boolean): Promise<void> {
  console.log('='.repeat(60));
  console.log('Move user email and wallet to private/profile');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  console.log(`Project: ${admin.app().options.projectId || 'unknown'}`);
  console.log('');

  let scanned = 0;
  let moved = 0;
  let skipped = 0;
  let errors = 0;

  const pageSize = 200;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      scanned += 1;
      const data = doc.data();
      if (!publicDocHasPrivateFields(data)) {
        skipped += 1;
        continue;
      }

      const payload = privatePayload(data);
      const deletions: Record<string, admin.firestore.FieldValue> = {};
      for (const field of PRIVATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          deletions[field] = admin.firestore.FieldValue.delete();
        }
      }

      try {
        if (!dryRun) {
          if (Object.keys(payload).length > 0) {
            await doc.ref.collection('private').doc('profile').set(payload, { merge: true });
          }
          await doc.ref.update(deletions);
        }
        moved += 1;
        console.log(
          `${dryRun ? 'Would move' : 'Moved'} ${doc.id}: ${Object.keys(payload).join(', ') || '(delete empty fields)'}`
        );
      } catch (error) {
        errors += 1;
        console.error(`Failed ${doc.id}:`, error);
      }
    }

    last = page.docs[page.docs.length - 1];
    if (page.size < pageSize) break;
  }

  console.log('');
  console.log(`Scanned ${scanned}. Moved ${moved}. Already clean ${skipped}. Errors ${errors}.`);
  if (errors > 0) process.exitCode = 1;
}

const dryRun = process.argv.includes('--dry-run');
migrateUserPrivate(dryRun).catch(error => {
  console.error(error);
  process.exit(1);
});
