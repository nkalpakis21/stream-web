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
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Sign in to create</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Create AI artists and generate music
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Create</h1>
          <div className="flex gap-4 border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('artist')}
              className={`px-4 py-2 ${
                activeTab === 'artist'
                  ? 'border-b-2 border-blue-600 font-semibold'
                  : 'text-gray-500'
              }`}
            >
              AI Artist
            </button>
            <button
              onClick={() => setActiveTab('song')}
              className={`px-4 py-2 ${
                activeTab === 'song'
                  ? 'border-b-2 border-blue-600 font-semibold'
                  : 'text-gray-500'
              }`}
            >
              Song
            </button>
          </div>
        </div>

        {activeTab === 'artist' && <CreateArtistForm />}
        {activeTab === 'song' && <CreateSongForm />}
      </main>
    </div>
  );
}

