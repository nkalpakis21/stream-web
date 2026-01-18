import { redirect } from 'next/navigation';
import { Nav } from '@/components/navigation/Nav';
import { FeedPageClient } from '@/components/feed/FeedPageClient';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8 lg:py-12">
        <div className="mb-8">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-2">Your Feed</h1>
          <p className="text-lg text-muted-foreground">
            Songs from artists you follow
          </p>
        </div>
        <FeedPageClient />
      </main>
    </div>
  );
}
