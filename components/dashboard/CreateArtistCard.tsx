'use client';

interface CreateArtistCardProps {
  onClick: () => void;
}

export function CreateArtistCard({ onClick }: CreateArtistCardProps) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="block text-center group w-full p-0 m-0 bg-transparent border-0"
    >
      <div className="relative w-full aspect-square rounded-full overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30 mb-3 ring-2 ring-dashed ring-border group-hover:ring-accent/50 transition-all duration-300 group-hover:scale-105 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:text-accent transition-colors">
          <div className="w-12 h-12 rounded-full bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center transition-colors">
            <svg
              className="w-6 h-6 text-accent"
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
        </div>
      </div>
      <h3 className="font-medium text-sm text-foreground group-hover:text-accent transition-colors line-clamp-1">
        Create New Artist
      </h3>
    </button>
  );
}

