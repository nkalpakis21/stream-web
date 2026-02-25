'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { V0Navbar } from '@/components/navigation/V0Navbar';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { OverviewTab } from '@/components/dashboard/OverviewTab';
import { ArtistsTab } from '@/components/dashboard/ArtistsTab';
import { SongsTab } from '@/components/dashboard/SongsTab';
import { getUserSongs } from '@/lib/services/songs';
import { getUserArtists } from '@/lib/services/artists';
import { getArtistNamesForSongs } from '@/lib/services/songs';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';

type DashboardTab = 'overview' | 'artists' | 'songs';

function DashboardContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [songArtistMap, setSongArtistMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  
  // Get active tab from URL or default to 'overview'
  const activeTab = (searchParams.get('tab') as DashboardTab) || 'overview';
  const artistId = searchParams.get('artistId'); // For song creation flow

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/signin');
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
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading, router]);

  const handleTabChange = (tab: DashboardTab) => {
    router.push(`/dashboard?tab=${tab}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <V0Navbar />
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
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <V0Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-6 lg:pt-24 lg:pb-10">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-2 text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage your artists, songs, and creative work
          </p>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="hidden md:block mb-8">
          <DashboardTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Content Area */}
        <div className="min-h-[60vh]">
          {activeTab === 'overview' && (
            <OverviewTab
              user={user}
              stats={stats}
              songs={songs}
              artists={artists}
              songArtistMap={songArtistMap}
            />
          )}
          {activeTab === 'artists' && (
            <ArtistsTab
              artists={artists}
              onArtistCreated={() => {
                // Reload artists when one is created
                getUserArtists(user.uid).then(setArtists);
              }}
            />
          )}
          {activeTab === 'songs' && (
            <SongsTab
              songs={songs}
              songArtistMap={songArtistMap}
              preselectedArtistId={artistId || undefined}
              onSongCreated={() => {
                // Reload songs when one is created
                getUserSongs(user.uid).then(userSongs => {
                  setSongs(userSongs);
                  if (userSongs.length > 0) {
                    getArtistNamesForSongs(userSongs).then(setSongArtistMap);
                  }
                });
              }}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <V0Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

