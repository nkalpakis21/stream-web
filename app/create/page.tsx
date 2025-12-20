'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { CreateArtistForm } from '@/components/artists/CreateArtistForm';
import { CreateSongForm } from '@/components/songs/CreateSongForm';
import { AuthForm } from '@/components/auth/AuthForm';
import { Nav } from '@/components/navigation/Nav';
import { useState } from 'react';

export default function CreatePage() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'artist' | 'song'>('artist');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold tracking-tight mb-3">Sign in to create</h1>
            <p className="text-lg text-muted-foreground">
              Create AI artists and generate music
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      <main className="max-w-3xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
        <div className="mb-10">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-8">Create</h1>
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab('artist')}
              className={`px-6 py-3 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                activeTab === 'artist'
                  ? 'text-accent border-b-2 border-accent bg-muted/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AI Artist
            </button>
            <button
              onClick={() => setActiveTab('song')}
              className={`px-6 py-3 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                activeTab === 'song'
                  ? 'text-accent border-b-2 border-accent bg-muted/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Song
            </button>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-8 lg:p-10 shadow-soft border border-border">
          {activeTab === 'artist' && <CreateArtistForm />}
          {activeTab === 'song' && <CreateSongForm />}
        </div>
      </main>
    </div>
  );
}

