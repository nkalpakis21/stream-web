'use client';

interface CreateSongCardProps {
  onClick: () => void;
}

export function CreateSongCard({ onClick }: CreateSongCardProps) {
  return (
    <div
      onClick={onClick}
      className="group block bg-card rounded-xl overflow-hidden shadow-soft hover:shadow-medium transition-all duration-300 card-hover border-2 border-dashed border-border hover:border-accent/50 w-full cursor-pointer"
    >
      <div className="relative w-full aspect-square bg-gradient-to-br from-muted/50 to-muted/30 overflow-hidden flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground group-hover:text-accent transition-colors">
          <div className="w-16 h-16 rounded-full bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center transition-colors">
            <svg
              className="w-8 h-8 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <span className="text-sm font-medium">Create New Song</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-1 text-card-foreground group-hover:text-accent transition-colors">
          Create New Song
        </h3>
        <p className="text-xs text-muted-foreground">
          Start creating
        </p>
      </div>
    </div>
  );
}

