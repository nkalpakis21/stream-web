'use client';

import { useMemo } from 'react';
import type { SongDocument } from '@/types/firestore';

interface PlaysChartProps {
  songs: SongDocument[];
}

export function PlaysChart({ songs }: PlaysChartProps) {
  const chartData = useMemo(() => {
    // Get top 10 songs by play count
    const sortedSongs = [...songs]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 10);

    return sortedSongs.map(song => ({
      title: song.title,
      plays: song.playCount || 0,
    }));
  }, [songs]);

  const maxPlays = Math.max(...chartData.map(d => d.plays), 1);
  const chartHeight = 120;

  if (chartData.length === 0) {
    return (
      <div className="bg-card/50 border border-border/40 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top Songs</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No plays yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Top Songs</h3>
        <span className="text-xs text-muted-foreground">
          {chartData.reduce((sum, d) => sum + d.plays, 0)} total plays
        </span>
      </div>
      <div className="space-y-3">
        {chartData.map((item, index) => {
          const width = (item.plays / maxPlays) * 100;
          
          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1 mr-2">
                  {item.title}
                </span>
                <span className="text-foreground font-medium">{item.plays}</span>
              </div>
              <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


