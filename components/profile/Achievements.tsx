'use client';

import { useMemo } from 'react';

interface AchievementsProps {
  songsCount: number;
  artistsCount: number;
  totalPlays: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
}

export function Achievements({ songsCount, artistsCount, totalPlays }: AchievementsProps) {
  const achievements = useMemo<Achievement[]>(() => {
    return [
      {
        id: 'first-song',
        title: 'First Song',
        description: 'Create your first song',
        icon: '🎵',
        unlocked: songsCount >= 1,
        progress: Math.min(songsCount, 1),
        maxProgress: 1,
      },
      {
        id: 'prolific-creator',
        title: 'Prolific Creator',
        description: 'Create 10 songs',
        icon: '🎼',
        unlocked: songsCount >= 10,
        progress: Math.min(songsCount, 10),
        maxProgress: 10,
      },
      {
        id: 'hit-maker',
        title: 'Hit Maker',
        description: 'Create 50 songs',
        icon: '⭐',
        unlocked: songsCount >= 50,
        progress: Math.min(songsCount, 50),
        maxProgress: 50,
      },
      {
        id: 'first-artist',
        title: 'First Artist',
        description: 'Create your first AI artist',
        icon: '👤',
        unlocked: artistsCount >= 1,
        progress: Math.min(artistsCount, 1),
        maxProgress: 1,
      },
      {
        id: 'artist-collector',
        title: 'Artist Collector',
        description: 'Create 5 artists',
        icon: '👥',
        unlocked: artistsCount >= 5,
        progress: Math.min(artistsCount, 5),
        maxProgress: 5,
      },
      {
        id: 'viral',
        title: 'Going Viral',
        description: 'Get 100 total plays',
        icon: '🔥',
        unlocked: totalPlays >= 100,
        progress: Math.min(totalPlays, 100),
        maxProgress: 100,
      },
      {
        id: 'superstar',
        title: 'Superstar',
        description: 'Get 1,000 total plays',
        icon: '🌟',
        unlocked: totalPlays >= 1000,
        progress: Math.min(totalPlays, 1000),
        maxProgress: 1000,
      },
    ];
  }, [songsCount, artistsCount, totalPlays]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Achievements</h3>
        <span className="text-xs text-muted-foreground">
          {unlockedCount} / {achievements.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {achievements.map(achievement => {
          const progressPercent = (achievement.progress / achievement.maxProgress) * 100;
          
          return (
            <div
              key={achievement.id}
              className={`relative p-3 rounded-lg border transition-all duration-200 ${
                achievement.unlocked
                  ? 'bg-accent/10 border-accent/30'
                  : 'bg-muted/30 border-border/40 opacity-60'
              }`}
            >
              <div className="text-2xl mb-1">{achievement.icon}</div>
              <div className="text-xs font-medium text-foreground mb-0.5">
                {achievement.title}
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                {achievement.description}
              </div>
              {!achievement.unlocked && (
                <div className="space-y-1">
                  <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/50 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {achievement.progress} / {achievement.maxProgress}
                  </div>
                </div>
              )}
              {achievement.unlocked && (
                <div className="absolute top-2 right-2">
                  <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

