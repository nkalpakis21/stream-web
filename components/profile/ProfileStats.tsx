'use client';

interface ProfileStatsProps {
  stats: {
    songsCount: number;
    artistsCount: number;
    totalPlays: number;
  };
}

export function ProfileStats({ stats }: ProfileStatsProps) {
  return (
    <div className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-card border border-border/50 rounded-2xl p-6 hover:border-border transition-colors">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.songsCount}</p>
            <p className="text-sm text-muted-foreground">Songs</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-6 hover:border-border transition-colors">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.artistsCount}</p>
            <p className="text-sm text-muted-foreground">Artists</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-6 hover:border-border transition-colors">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.totalPlays.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Total Plays</p>
          </div>
        </div>
      </div>
    </div>
  );
}

