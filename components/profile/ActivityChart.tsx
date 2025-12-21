'use client';

import { useMemo } from 'react';
import type { SongDocument } from '@/types/firestore';

interface ActivityChartProps {
  songs: SongDocument[];
}

export function ActivityChart({ songs }: ActivityChartProps) {
  const chartData = useMemo(() => {
    // Group songs by creation date (last 30 days)
    const days = 30;
    const today = new Date();
    const data: number[] = new Array(days).fill(0);

    songs.forEach(song => {
      const songDate = song.createdAt.toDate();
      const daysAgo = Math.floor((today.getTime() - songDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysAgo >= 0 && daysAgo < days) {
        data[days - 1 - daysAgo]++;
      }
    });

    return data;
  }, [songs]);

  const maxValue = Math.max(...chartData, 1);
  const chartHeight = 120;
  const chartWidth = 100;
  const barWidth = chartWidth / chartData.length;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity (30 days)</h3>
        <span className="text-xs text-muted-foreground">
          {chartData.reduce((a, b) => a + b, 0)} songs created
        </span>
      </div>
      <div className="flex items-end gap-0.5 h-[120px]">
        {chartData.map((value, index) => {
          const height = (value / maxValue) * chartHeight;
          const opacity = value > 0 ? 0.6 + (value / maxValue) * 0.4 : 0.1;
          
          return (
            <div
              key={index}
              className="flex-1 bg-accent rounded-t transition-all duration-300 hover:opacity-100"
              style={{
                height: `${Math.max(height, 2)}px`,
                opacity,
              }}
              title={`${value} song${value !== 1 ? 's' : ''} on day ${30 - index}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>30d ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}

