# Stream Architecture

## Overview

Stream is an AI-native music platform built with Next.js 14 (App Router), TypeScript, and Firebase. This document outlines the architectural decisions and structure.

## Core Principles

1. **Immutable Versioning**: All entities (Artists, Songs) support versioning. Versions are immutable and reference their parent.
2. **Proof-Ready Ownership**: Content hashes are generated for all generations, ready for future blockchain integration.
3. **Pluggable AI Providers**: AI services are abstracted through a provider interface, allowing easy integration of new providers.
4. **Public by Default**: Content is public by default, with optional private visibility.
5. **GitHub-Style Collaboration**: Forking and remixing create new entities with clear lineage tracking.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Storage**: Firebase Storage
- **Styling**: Tailwind CSS

## Project Structure

```
/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with AuthProvider
│   ├── page.tsx           # Home page / discovery feed
│   ├── create/            # Create artist/song pages
│   ├── discover/          # Discovery/search page
│   ├── artists/           # Artist pages
│   └── songs/             # Song pages
├── components/            # React components
│   ├── providers/         # Context providers (Auth)
│   ├── artists/           # Artist-related components
│   └── songs/             # Song-related components
├── lib/                   # Core business logic
│   ├── firebase/          # Firebase configuration
│   ├── services/          # Business logic services
│   ├── ai/                # AI service abstraction
│   └── utils/             # Utility functions
└── types/                 # TypeScript type definitions
    └── firestore.ts       # Firestore schema types
```

## Data Model

### Collections

- `/users/{id}` - User profiles
- `/artists/{id}` - AI Artists (current state)
- `/artistVersions/{id}` - Immutable artist versions
- `/songs/{id}` - Songs (current state)
- `/songVersions/{id}` - Immutable song versions
- `/generations/{id}` - Song generation requests and results
- `/collaborations/{id}` - Collaboration relationships (fork/remix lineage)

### Key Design Decisions

1. **Separate Version Collections**: Versions are stored in separate collections to maintain immutability and enable efficient querying.
2. **Soft Deletes**: Entities use `deletedAt` timestamps instead of hard deletes.
3. **Reference IDs**: Documents reference each other by ID rather than nesting.
4. **Content Hashing**: Generations include content hashes for proof-ready ownership.

## AI Service Architecture

The AI service layer is designed to be pluggable:

```typescript
interface AIProvider {
  id: string;
  name: string;
  generateSong(request: AIGenerationRequest): Promise<AIGenerationResponse>;
  isAvailable(): boolean;
}
```

Providers are registered with the `AIService` singleton. Currently, a stub provider is included for development. Real providers (OpenAI, Stability AI, etc.) can be added by implementing the `AIProvider` interface.

## Versioning System

### Artist Versioning

- Each artist has a `currentVersionId` pointing to the latest version
- New versions are created when an artist evolves
- Versions are immutable and reference their parent via `parentVersionId`
- Version 1 has `parentVersionId: null`

### Song Versioning

- Similar to artist versioning
- Songs can have multiple versions as they evolve
- Each version can have multiple generations (different AI outputs)

## Collaboration Model

### Fork

Creates a new song based on an existing one:
- New song with `parentSongId` pointing to source
- `collaborationType: 'fork'`
- Collaboration record tracks the relationship

### Remix

Similar to fork but with `collaborationType: 'remix'`:
- Indicates a more creative transformation
- Same lineage tracking as fork

### Lineage Tracking

The `collaborations` collection tracks all relationships:
- `sourceSongId` → `targetSongId`
- Enables building collaboration trees
- Supports recursive lineage queries

## Discovery

Discovery is AI-native, not playlist-based:

1. **Prompt-Based Search**: Free-text search (currently basic, can be enhanced with Algolia)
2. **Artist Universes**: Browse all songs by a specific artist
3. **Mood/Vibe Filters**: Filter by genres, moods, tempo ranges
4. **Timeline Feed**: Recent public songs

## Authentication

- Firebase Auth with Google provider
- Auth state managed via React Context (`AuthProvider`)
- Protected routes check authentication status
- User IDs are used for ownership checks

## Future Enhancements

### Stubbed Features

- **Music Video Generation**: Placeholder for future visual generation
- **Blockchain Integration**: Schema designed to support on-chain minting
- **Monetization**: Not implemented in MVP

### Potential Improvements

1. **Full-Text Search**: Integrate Algolia or similar for better search
2. **Real-Time Updates**: Use Firestore listeners for live generation status
3. **Audio Processing**: Add stem separation, mixing capabilities
4. **Social Features**: Comments, likes, follows
5. **Advanced Discovery**: ML-based recommendations, similarity search

## Security Considerations

1. **Firestore Rules**: Should be configured to enforce:
   - Users can only modify their own content
   - Public content is readable by all
   - Private content is only readable by owner
2. **Storage Rules**: Audio files should be protected appropriately
3. **Rate Limiting**: Consider adding rate limits for generation requests

## Performance Optimizations

1. **Server Components**: Most pages use Server Components for better performance
2. **Client Components**: Only used when needed (forms, interactive elements)
3. **Lazy Loading**: Consider code splitting for heavy components
4. **Caching**: Firestore queries can be cached at the Next.js level

## Deployment

1. Set up Firebase project
2. Configure environment variables (`.env.local`)
3. Set up Firestore security rules
4. Configure Firebase Storage rules
5. Deploy to Vercel or similar platform



