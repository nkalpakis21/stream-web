'use client';

interface ProgressIndicatorProps {
  currentStep: 'artist' | 'song';
  artistCreated?: boolean;
  hasArtists?: boolean;
}

export function ProgressIndicator({ currentStep, artistCreated, hasArtists = false }: ProgressIndicatorProps) {
  const steps = [
    { id: 'artist', label: 'Create AI Artist', number: 1 },
    { id: 'song', label: 'Create Song', number: 2 },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id === 'artist' && (currentStep === 'song' || artistCreated);
          const isUpcoming = step.number > (currentStep === 'artist' ? 1 : 2);

          return (
            <div key={step.id} className="flex-1 flex items-center">
              {/* Step Circle */}
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                    isCompleted
                      ? 'bg-accent text-accent-foreground'
                      : isActive
                      ? 'bg-accent text-accent-foreground ring-4 ring-accent/20'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium transition-colors ${
                    isActive || isCompleted
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-colors ${
                    isCompleted || currentStep === 'song'
                      ? 'bg-accent'
                      : 'bg-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Contextual Message */}
      {currentStep === 'song' && artistCreated && (
        <div className="mt-4 p-4 bg-accent/10 border border-accent/20 rounded-xl">
          <p className="text-sm text-foreground">
            <span className="font-semibold">✓ Artist created!</span> Now create your first song with your new AI artist.
          </p>
        </div>
      )}
      {currentStep === 'artist' && !hasArtists && (
        <div className="mt-4 p-4 bg-muted/50 border border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            Start by creating your first AI artist. You&apos;ll use this artist to generate songs.
          </p>
        </div>
      )}
    </div>
  );
}

