import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

// Initialize Firebase app with error handling
let app: FirebaseApp | null = null;

function getApp(): FirebaseApp {
  if (!app) {
    if (getApps().length === 0) {
      // Only initialize if we have required config
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        // During build, create a placeholder config to prevent errors
        // This will be properly initialized at runtime
        if (process.env.NEXT_PHASE === 'phase-production-build') {
          console.warn('[Firebase] Build-time: Missing env vars, using placeholder config');
          app = initializeApp({
            apiKey: 'build-placeholder',
            authDomain: 'build-placeholder',
            projectId: 'build-placeholder',
            storageBucket: 'build-placeholder',
            messagingSenderId: 'build-placeholder',
            appId: 'build-placeholder',
          });
        } else {
          throw new Error('Firebase config is missing required fields. Please set NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID');
        }
      } else {
        app = initializeApp(firebaseConfig);
      }
    } else {
      app = getApps()[0];
    }
  }
  return app;
}

// Lazy initialization for services
// These will only initialize when actually accessed, not at module load time
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

function getAuthInstance(): Auth {
  if (!_auth) {
    // During build/initial deployment, if we're using placeholder config,
    // getAuth might fail. We'll handle it gracefully.
    const currentApp = getApp();
    const isPlaceholderConfig = currentApp.options.apiKey === 'build-placeholder';
    
    if (isPlaceholderConfig && process.env.NEXT_PHASE === 'phase-production-build') {
      // During build with placeholder config, initialize auth anyway
      // It will use the placeholder config but won't fail the build
      _auth = getAuth(currentApp);
    } else {
      try {
        _auth = getAuth(currentApp);
      } catch (error) {
        // At runtime, if auth fails, it's a real error
        throw error;
      }
    }
  }
  return _auth;
}

function getDbInstance(): Firestore {
  if (!_db) {
    _db = getFirestore(getApp());
  }
  return _db;
}

function getStorageInstance(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(getApp());
  }
  return _storage;
}

// Export services - they will initialize on first access
// During initial deployment/build, if env vars aren't set yet, 
// the placeholder config will be used and Firebase will initialize properly at runtime
export const auth: Auth = getAuthInstance();
export const db: Firestore = getDbInstance();
export const storage: FirebaseStorage = getStorageInstance();

export default getApp();

