'use client';

import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { StudioCreateCards } from '@/components/dashboard/StudioCreateCards';

/** Studio chrome. The create cards are the same ones the overview renders. */
export function DashboardPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Studio
          </h1>
          <p className="text-muted-foreground">Create artists and generate songs.</p>
        </div>
        <div className="mb-8 overflow-x-auto">
          <DashboardTabs activeTab="overview" onTabChange={() => {}} />
        </div>
        <div className="min-h-[60vh]">
          <StudioCreateCards />
        </div>
      </main>
    </div>
  );
}
