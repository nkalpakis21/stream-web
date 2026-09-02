import { BagPageClient } from '@/components/bag/BagPageClient';

export const dynamic = 'force-dynamic';

export default function MePage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8">
          <h1 className="listen-h1 mb-2">Your coins</h1>
          <p className="text-lg text-muted-foreground">
            Your coins, value, and 24h change
          </p>
        </div>
        <BagPageClient />
      </main>
    </div>
  );
}
