'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { OverviewTab } from '@/components/dashboard/OverviewTab';
import { ArtistsTab } from '@/components/dashboard/ArtistsTab';
import { SongsTab } from '@/components/dashboard/SongsTab';
import { getUserSongs } from '@/lib/services/songs';
import { getUserArtists } from '@/lib/services/artists';
import { fetchArtistCardDisplays } from '@/lib/artists/fetchCardDisplay';
import type { ArtistCardDisplay } from '@/lib/artists/cardDisplay';
import type { SongDocument, AIArtistDocument } from '@/types/firestore';
import { authHref, currentReturnTo } from '@/lib/auth/returnTo';
import { DashboardPageSkeleton } from '@/components/dashboard/DashboardPageSkeleton';

type DashboardTab = 'overview' | 'artists' | 'songs';

function DashboardContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [songs, setSongs] = useState<SongDocument[]>([]);
  const [artists, setArtists] = useState<AIArtistDocument[]>([]);
  const [songArtistMap, setSongArtistMap] = useState<Map<string, string>>(new Map());
  const [artistDisplays, setArtistDisplays] = useState<Map<string, ArtistCardDisplay>>(new Map());
  const [loading, setLoading] = useState(true);
  
  // Get active tab from URL or default to 'overview'
  const activeTab = (searchParams.get('tab') as DashboardTab) || 'overview';
  const artistId = searchParams.get('artistId'); // For song creation flow

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      const search = searchParams.toString();
      router.replace(authHref('/signin', currentReturnTo('/dashboard', search ? `?${search}` : '')));
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

        if (userSongs.length > 0) {
          const displays = await fetchArtistCardDisplays(userSongs.map(song => song.artistId));
          setArtistDisplays(displays);
          const artistMap = new Map<string, string>();
          userSongs.forEach(song => {
            const name = displays.get(song.artistId)?.name;
            if (name) artistMap.set(song.id, name);
          });
          setSongArtistMap(artistMap);
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, authLoading, router, searchParams]);

  const handleTabChange = (tab: DashboardTab) => {
    router.push(`/dashboard?tab=${tab}`);
  };

  if (authLoading || loading) {
    return <DashboardPageSkeleton />;
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-2 text-foreground">
            Studio
          </h1>
          <p className="text-muted-foreground">
            Create artists and generate songs.
          </p>
        </div>

        {/* Desktop Tab Navigation */}
        <div className="mb-8 overflow-x-auto">
          <DashboardTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Content Area */}
        <div className="min-h-[60vh]">
          {activeTab === 'overview' && (
            <OverviewTab
              songs={songs}
              artists={artists}
              songArtistMap={songArtistMap}
              artistDisplays={artistDisplays}
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
              artistDisplays={artistDisplays}
              preselectedArtistId={artistId || undefined}
              onSongCreated={() => {
                // Reload songs when one is created
                getUserSongs(user.uid).then(userSongs => {
                  setSongs(userSongs);
                  if (userSongs.length === 0) return;
                  fetchArtistCardDisplays(userSongs.map(song => song.artistId)).then(displays => {
                    setArtistDisplays(displays);
                    const artistMap = new Map<string, string>();
                    userSongs.forEach(song => {
                      const name = displays.get(song.artistId)?.name;
                      if (name) artistMap.set(song.id, name);
                    });
                    setSongArtistMap(artistMap);
                  });
                });
              }}
            />
          )}
        </div>
      </main>

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

