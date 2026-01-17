'use client';

import { useMemo } from 'react';

interface LevelProgressProps {
  songsCount: number;
  artistsCount: number;
  totalPlays: number;
}

export function LevelProgress({ songsCount, artistsCount, totalPlays }: LevelProgressProps) {
  const { level, xp, xpForNextLevel, progressPercent } = useMemo(() => {
    // Calculate XP: songs * 10 + artists * 50 + plays * 1
    const totalXP = songsCount * 10 + artistsCount * 50 + totalPlays * 1;
    
    // Level formula: level = floor(sqrt(totalXP / 100))
    const calculatedLevel = Math.floor(Math.sqrt(totalXP / 100)) + 1;
    
    // XP for current level
    const xpForCurrentLevel = Math.pow(calculatedLevel - 1, 2) * 100;
    const xpForNextLevel = Math.pow(calculatedLevel, 2) * 100;
    const xpInCurrentLevel = totalXP - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    const progress = (xpInCurrentLevel / xpNeededForNext) * 100;
    
    return {
      level: calculatedLevel,
      xp: totalXP,
      xpForNextLevel: xpNeededForNext,
      progressPercent: Math.min(progress, 100),
    };
  }, [songsCount, artistsCount, totalPlays]);

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">Level {level}</h3>
          <p className="text-xs text-muted-foreground">
            {xp.toLocaleString()} XP
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-accent">{level}</div>
          <div className="text-[10px] text-muted-foreground">Level</div>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent/70 rounded-full transition-all duration-500 relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.floor(progressPercent)}% to next level</span>
          <span>{xpForNextLevel.toLocaleString()} XP needed</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/40">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-foreground">
              {songsCount * 10}
            </div>
            <div className="text-[10px] text-muted-foreground">Songs XP</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">
              {artistsCount * 50}
            </div>
            <div className="text-[10px] text-muted-foreground">Artists XP</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">
              {totalPlays}
            </div>
            <div className="text-[10px] text-muted-foreground">Plays XP</div>
          </div>
        </div>
      </div>
    </div>
  );
}



