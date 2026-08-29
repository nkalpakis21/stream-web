import { HomeListenSkeleton } from '@/components/homepage/HomeListenSkeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-background">
      <HomeListenSkeleton />
    </main>
  );
}
