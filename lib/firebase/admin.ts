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
      _adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      const serviceAccountPath = getServiceAccountPath();
      if (serviceAccountPath) {
        const serviceAccount = loadServiceAccountFromFile(serviceAccountPath);
        _adminApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        });
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
