/**
 * Firebase Admin SDK for server-side auth verification.
 * Used by API routes to verify Firebase ID tokens.
 *
 * Setup (order of precedence):
 * 1. FIREBASE_SERVICE_ACCOUNT - JSON string (env var)
 * 2. GOOGLE_APPLICATION_CREDENTIALS - path to key file
 * 3. FIREBASE_SERVICE_ACCOUNT_PATH - explicit path (e.g. ./serviceAccountKey.dev.json)
 * 4. File-based fallback:
 *    - Development: serviceAccountKey.dev.json, then serviceAccountKey.json
 *    - Production: serviceAccountKey.json
 */

import * as admin from 'firebase-admin';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

let _adminApp: admin.app.App | null = null;

/**
 * Default Storage bucket for Admin uploads. The cert does not always imply a
 * bucket, so pass this on initializeApp and when calling `.bucket(name)`.
 */
function getStorageBucketName(): string | undefined {
  const raw =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    '';
  const name = raw.replace(/^gs:\/\//, '').trim();
  return name || undefined;
}

function adminAppOptions(
  credential: ReturnType<typeof admin.credential.cert>
): admin.AppOptions {
  const storageBucket = getStorageBucketName();
  return storageBucket ? { credential, storageBucket } : { credential };
}

function loadServiceAccountFromFile(path: string): object {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function getServiceAccountPath(): string | null {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const path = resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return existsSync(path) ? path : null;
  }
  const devPath = resolve(process.cwd(), 'serviceAccountKey.dev.json');
  const prodPath = resolve(process.cwd(), 'serviceAccountKey.json');
  if (process.env.NODE_ENV === 'development' && existsSync(devPath)) {
    return devPath;
  }
  return existsSync(prodPath) ? prodPath : null;
}

function getAdminApp(): admin.app.App {
  if (!_adminApp) {
    if (admin.apps.length > 0) {
      _adminApp = admin.app();
      return _adminApp;
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      _adminApp = admin.initializeApp(
        adminAppOptions(admin.credential.cert(serviceAccount))
      );
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _adminApp = admin.initializeApp(
        adminAppOptions(admin.credential.applicationDefault())
      );
    } else {
      const serviceAccountPath = getServiceAccountPath();
      if (serviceAccountPath) {
        const serviceAccount = loadServiceAccountFromFile(serviceAccountPath);
        _adminApp = admin.initializeApp(
          adminAppOptions(
            admin.credential.cert(serviceAccount as admin.ServiceAccount)
          )
        );
      } else {
        throw new Error(
          'Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_PATH, or add serviceAccountKey.dev.json (dev) / serviceAccountKey.json (prod)'
        );
      }
    }
  }
  return _adminApp;
}

/**
 * Verify a Firebase ID token and return the decoded claims.
 * Throws if the token is invalid.
 */
export async function verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getAdminApp();
  return app.auth().verifyIdToken(idToken);
}

/**
 * Admin Firestore. Used for server-only data (X OAuth tokens) that must
 * never be readable through the client SDK / security rules.
 */
export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

/**
 * Admin Storage bucket for server-side uploads (bypasses client Storage rules).
 * Prefers an explicit bucket name from env; otherwise uses the app default.
 */
export function getAdminBucket() {
  const app = getAdminApp();
  const name = getStorageBucketName();
  if (name) {
    return app.storage().bucket(name);
  }
  return app.storage().bucket();
}

export function isFirebaseAdminConfigured(): boolean {
  try {
    getAdminApp();
    return true;
  } catch {
    return false;
  }
}
