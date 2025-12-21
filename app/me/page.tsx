'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Nav } from '@/components/navigation/Nav';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { UserSongsSection } from '@/components/profile/UserSongsSection';
import { UserArtistsSection } from '@/components/profile/UserArtistsSection';
import { ActivityChart } from '@/components/profile/ActivityChart';
import { PlaysChart } from '@/components/profile/PlaysChart';
import { Achievements } from '@/components/profile/Achievements';
import { LevelProgress } from '@/components/profile/LevelProgress';
import { getUserSongs } from '@/lib/services/songs';
import { getUserArtists } from '@/lib/services/artists';
import { getArtistNamesForSongs } from '@/lib/services/songs';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [songArtistMap, setSongArtistMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/');
      return;
    }

    const loadData = async () => {
      try {
        const [userSongs, userArtists] = await Promise.all([
          getUserSongs(user.uid),
          getUserArtists(user.uid),
        ]);

        setSongs(userSongs);
        setArtists(userArtists);

        // Get artist names for songs
        if (userSongs.length > 0) {
          const artistMap = await getArtistNamesForSongs(userSongs);
          setSongArtistMap(artistMap);
        }
      } catch (error) {
        console.error('Failed to load profile data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  // Calculate stats
  const totalPlays = songs.reduce((sum, song) => sum + (song.playCount || 0), 0);
  const stats = {
    songsCount: songs.length,
    artistsCount: artists.length,
    totalPlays,
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      
      <main className="max-w-5xl mx-auto px-6 lg:px-8 py-10 lg:py-14">
        {/* Profile Header */}
        <ProfileHeader 
          user={user}
          stats={stats}
        />

        {/* Gamification Section */}
        <div className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LevelProgress
            songsCount={stats.songsCount}
            artistsCount={stats.artistsCount}
            totalPlays={stats.totalPlays}
          />
          <Achievements
            songsCount={stats.songsCount}
            artistsCount={stats.artistsCount}
            totalPlays={stats.totalPlays}
          />
        </div>

        {/* Charts Section */}
        <div className="mb-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityChart songs={songs} />
          <PlaysChart songs={songs} />
        </div>

        {/* User's Artists */}
        <UserArtistsSection artists={artists} />

        {/* User's Songs */}
        <UserSongsSection 
          songs={songs} 
          songArtistMap={songArtistMap}
        />
      </main>
    </div>
  );
}

