'use client';

import type { GenerationDocument } from '@/types/firestore';

interface SongPlayerProps {
  generation: GenerationDocument;
}

export function SongPlayer({ generation }: SongPlayerProps) {
  if (!generation.output.audioURL) {
    return (
      <div className="p-8 border border-gray-200 dark:border-gray-800 rounded-lg text-center">
        <p className="text-gray-500">Audio not available</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
      <audio
        controls
        className="w-full"
        src={generation.output.audioURL}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

