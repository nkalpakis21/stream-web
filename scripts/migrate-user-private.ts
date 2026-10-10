#!/usr/bin/env tsx
/**
 * Move email and solanaWalletAddress off users/{uid} onto
 * users/{uid}/private/profile.
 *
 * Not invoked by the app, CI, or deploy. Run the steps by hand, in order:
 *   1. copy   (before the new rules)
 *   2. deploy indexes, wait until they are built, promote, then
 *   3. strip  (after promote, before the rules deploy)
 *
 * copy writes the public email and wallet onto private/profile and leaves
 * the public doc untouched. strip re-copies first, then deletes email and
 * solanaWalletAddress from the public doc.
 *
 * On strip, a private profile with no walletUpdatedAt takes the public
 * wallet (a relink between copy and promote). A profile that already has
 * walletUpdatedAt keeps its wallet (a link after promote). Email is copied
 * only when private/profile does not already have one.
 *
 * Setup matches scripts/migrate-user-documents.ts (service account).
 *
 * Usage:
 *   tsx scripts/migrate-user-private.ts copy --dry-run
 *   tsx scripts/migrate-user-private.ts copy
 *   tsx scripts/migrate-user-private.ts strip --dry-run
 *   tsx scripts/migrate-user-private.ts strip
 */

import * as admin from 'firebase-admin';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  copyPayload,
  publicDocHasPrivateFields,
  stripRecopyPayload,
} from '../lib/server/userPrivateMigration';

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

type Step = 'copy' | 'strip';

function deletionsFor(data: admin.firestore.DocumentData): Record<string, admin.firestore.FieldValue> {
  const deletions: Record<string, admin.firestore.FieldValue> = {};
  for (const field of PRIVATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      deletions[field] = admin.firestore.FieldValue.delete();
    }
  }
  return deletions;
}

async function eachUser(
  visit: (doc: admin.firestore.QueryDocumentSnapshot) => Promise<void>
): Promise<void> {
  const pageSize = 200;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      await visit(doc);
    }

    last = page.docs[page.docs.length - 1];
    if (page.size < pageSize) break;
  }
}

async function migrateUserPrivate(step: Step, dryRun: boolean): Promise<void> {
  console.log('='.repeat(60));
  console.log(step === 'copy'
    ? 'Copy user email and wallet to private/profile'
    : 'Re-copy, then strip email and wallet from the public user doc');
  console.log('='.repeat(60));
  console.log(`Step: ${step}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be committed)'}`);
  console.log(`Project: ${admin.app().options.projectId || 'unknown'}`);
  console.log('');

  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  await eachUser(async (doc) => {
    scanned += 1;
    const data = doc.data();
    if (!publicDocHasPrivateFields(data)) {
      skipped += 1;
      return;
    }

    try {
      const privateRef = doc.ref.collection('private').doc('profile');
      let payload: Record<string, string | null>;
      if (step === 'copy') {
        payload = copyPayload(data);
      } else {
        const privateSnap = await privateRef.get();
        payload = stripRecopyPayload(data, privateSnap.exists ? privateSnap.data() : null);
      }
      const deletions = step === 'strip' ? deletionsFor(data) : {};

      if (!dryRun) {
        if (Object.keys(payload).length > 0) {
          await privateRef.set(payload, { merge: true });
        }
        if (Object.keys(deletions).length > 0) {
          await doc.ref.update(deletions);
        }
      }

      changed += 1;
      const verb = dryRun ? 'Would' : 'Did';
      const wrote = Object.keys(payload).join(', ') || '(no private write)';
      const stripped = step === 'strip' ? `; strip ${Object.keys(deletions).join(', ')}` : '';
      console.log(`${verb} ${step} ${doc.id}: ${wrote}${stripped}`);
    } catch (error) {
      errors += 1;
      console.error(`Failed ${doc.id}:`, error);
    }
  });

  console.log('');
  console.log(`Scanned ${scanned}. ${step === 'copy' ? 'Copied' : 'Stripped'} ${changed}. Already clean ${skipped}. Errors ${errors}.`);
  if (errors > 0) process.exitCode = 1;
}

function parseArgs(argv: string[]): { step: Step; dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const step = argv.find((arg) => arg === 'copy' || arg === 'strip');
  if (step !== 'copy' && step !== 'strip') {
    console.error('Usage: tsx scripts/migrate-user-private.ts <copy|strip> [--dry-run]');
    process.exit(1);
  }
  return { step, dryRun };
}

const { step, dryRun } = parseArgs(process.argv.slice(2));
migrateUserPrivate(step, dryRun).catch((error) => {
  console.error(error);
  process.exit(1);
});
