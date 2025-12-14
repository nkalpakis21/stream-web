# Stream — AI-Native Music Platform

An AI-native music platform built with Next.js, TypeScript, and Firebase.

## Features

- Generate full-length songs using AI
- Create and own AI Artists that evolve over time
- Collaborate through remixing, forking, and extending songs
- AI-native discovery (not playlist-based)
- Public sharing by default with optional privacy
- Immutable versioning and ownership tracking

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Storage**: Firebase Storage
- **Styling**: Tailwind CSS

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Set up Firebase:
   - Create a Firebase project
   - Copy `.env.example` to `.env.local`
   - Add your Firebase configuration

3. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Architecture

- `/app` - Next.js App Router pages and layouts
- `/components` - Reusable React components
- `/lib` - Core business logic, services, and utilities
- `/types` - TypeScript type definitions
- `/hooks` - Custom React hooks

