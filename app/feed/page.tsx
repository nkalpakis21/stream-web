import { redirect } from 'next/navigation';
import { V0Navbar } from '@/components/navigation/V0Navbar';
import { FeedPageClient } from '@/components/feed/FeedPageClient';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-background">
      <V0Navbar />
      <main className="max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-8 lg:pt-24 lg:pb-12">
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
