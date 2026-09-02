import { BagPageSkeleton } from '@/components/bag/BagHoldingSkeleton';
import '@/components/bag/bag.css';

export default function MeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <BagPageSkeleton />
      </main>
    </div>
  );
}
