# Stream Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Firebase project with:
  - Firestore Database
  - Authentication (Google provider enabled)
  - Storage

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Firebase:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore Database
   - Enable Authentication (Google provider)
   - Enable Storage
   - Get your Firebase configuration from Project Settings

3. Configure environment variables:
   - Copy `.env.example` to `.env.local`
   - Add your Firebase configuration:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   ```

   Optional — artist look generation (Fal Flux). Server-side only; do not commit a key:
   ```
   FAL_KEY=your-fal-api-key
   ```
   If `FAL_KEY` is unset, look generation is disabled. Managers can still upload and frame a photo as the artist look (no AI). Artist create also still works with a placeholder avatar.

   Optional — Fal song covers (STR-52). Server-side only. When set to `fal`, new gens enqueue a Flux poster + Luma Ray ~5s loop after audio is ready. MusicGPT album/cover webhook writes are ignored so stills do not overwrite Streamstar covers. Existing album URLs are left in place until the Flux poster lands (then dual-written as `albumCover*` aliases). Audio is never blocked by the cover job.
   ```
   COVER_PIPELINE=fal
   ```
   Optional cover model overrides (defaults shown):
   ```
   FAL_FLUX_COVER_MODEL=fal-ai/flux/dev
   FAL_FLUX_COVER_I2I_MODEL=fal-ai/flux/dev/image-to-image
   FAL_LUMA_COVER_MODEL=fal-ai/luma-dream-machine/ray-2/image-to-video
   ```
   Optional secret for `POST /api/covers/generate` (`x-cover-job-secret`). Falls back to `REVALIDATE_SECRET` when unset:
   ```
   COVER_JOB_SECRET=your-cover-job-secret
   ```
   Requires `FAL_KEY` and Firebase Admin + Storage (same as look uploads). Paths: `songs/{songId}/cover/poster.jpg`, `songs/{songId}/cover/loop.mp4`.

   Optional — artist X posting (OAuth 2.0 user-context). Server-side only; do not commit keys and do not prefix with `NEXT_PUBLIC_`:
   ```
   X_CLIENT_ID=your-x-oauth-client-id
   X_CLIENT_SECRET=your-x-oauth-client-secret
   ```
   If unset, Connect X is disabled and artist create still works. Streamstar never fakes posts.

   Callback URL to register on the X app (exact match):
   - Production: `https://streamstar.xyz/api/x/callback` (also add `https://www.streamstar.xyz/api/x/callback` if you serve www)
   - Develop preview: `https://stream-web-git-develop-nkalpakis.vercel.app/api/x/callback`
   - Local: `http://localhost:3000/api/x/callback`

   Optional override if the request origin is not a registered callback: `X_REDIRECT_URI=https://streamstar.xyz/api/x/callback`

   Scopes: `tweet.write users.read offline.access tweet.read media.write users.write`

4. Set up Firestore Security Rules:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Users can read/write their own user document
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       
       // Artists: public readable, owner writable
       match /artists/{artistId} {
         allow read: if resource.data.isPublic == true || 
                        request.auth != null && request.auth.uid == resource.data.ownerId;
         allow create: if request.auth != null;
         allow update, delete: if request.auth != null && 
                                   request.auth.uid == resource.data.ownerId;
       }
       
       // Artist versions: readable if artist is public or owned
       match /artistVersions/{versionId} {
         allow read: if true; // Versions are immutable, safe to read
         allow create: if request.auth != null;
       }
       
       // Songs: public readable, owner writable
       match /songs/{songId} {
         allow read: if resource.data.isPublic == true || 
                        request.auth != null && request.auth.uid == resource.data.ownerId;
         allow create: if request.auth != null;
         allow update, delete: if request.auth != null && 
                                   request.auth.uid == resource.data.ownerId;
       }
       
       // Song versions: readable if song is public or owned
       match /songVersions/{versionId} {
         allow read: if true; // Versions are immutable, safe to read
         allow create: if request.auth != null;
       }
       
       // Generations: readable if associated song is readable
       match /generations/{generationId} {
         allow read, write: if request.auth != null;
       }
       
       // Collaborations: readable by all
       match /collaborations/{collaborationId} {
         allow read: if true;
         allow create: if request.auth != null;
       }
     }
   }
   ```

5. Set up Storage Rules:
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /audio/{allPaths=**} {
         allow read: if true; // Public audio files
         allow write: if request.auth != null;
       }
     }
   }
   ```

## Running the Application

1. Start the development server:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000) in your browser

## First Steps

1. Sign in with Google
2. Create an AI Artist:
   - Go to `/create`
   - Fill in artist details (name, bio, genres, moods, etc.)
   - Click "Create Artist"
3. Generate a song:
   - Still on `/create`, switch to "Song" tab
   - Select your artist
   - Enter a prompt describing the song
   - Click "Generate Song"
   - Wait for generation to complete (stub provider returns immediately)

## Development Notes

- The app uses a stub AI provider for development
- Real AI providers can be added by implementing the `AIProvider` interface
- All data is stored in Firestore
- Audio files would be stored in Firebase Storage (currently using placeholder URLs)

## Troubleshooting

- **Firebase errors**: Check that your environment variables are set correctly
- **Auth errors**: Ensure Google provider is enabled in Firebase Console
- **Permission errors**: Check Firestore security rules
- **Import errors**: Run `npm install` to ensure all dependencies are installed



