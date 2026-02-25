'use client';

import { useState } from 'react';
import { LandingSongCard } from './LandingSongCard';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { SongDocument } from '@/types/firestore';

interface LatestSongsProps {
  latestSongs: SongDocument[];
  topSongs: SongDocument[];
  latestArtistMap: Map<string, string>;
  topArtistMap: Map<string, string>;
}

const tabs = ['Latest', 'Top'] as const;

export function LatestSongs({
  latestSongs,
  topSongs,
  latestArtistMap,
  topArtistMap,
}: LatestSongsProps) {
  const [activeTab, setActiveTab] = useState<'Latest' | 'Top'>('Latest');

  const songs = activeTab === 'Latest' ? latestSongs : topSongs;
  const artistMap = activeTab === 'Latest' ? latestArtistMap : topArtistMap;

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">Fresh tracks from the community</p>
          </div>
          <Link
            href="/discover"
            className="flex items-center gap-1 text-sm text-primary hover:underline underline-offset-4 transition-all group"
          >
            View All
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Songs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {songs.length > 0 ? (
            songs.map((song) => (
              <LandingSongCard
                key={song.id}
                song={song}
                artistName={artistMap.get(song.id)}
              />
            ))
          ) : (
            <div className="col-span-full py-16 text-center">
              <p className="text-muted-foreground">No songs yet. Be the first to create one!</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
