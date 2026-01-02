'use client';

import { useRouter } from 'next/navigation';

type DashboardTab = 'overview' | 'artists' | 'songs';

interface MobileBottomNavProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'overview',
    label: 'Home',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'artists',
    label: 'Artists',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: 'songs',
    label: 'Songs',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
];

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav 
      data-mobile-nav
      className="fixed bottom-0 left-0 right-0 bg-card/98 md:hidden z-50 border-t border-border shadow-lg supports-[backdrop-filter]:bg-card/95 supports-[backdrop-filter]:backdrop-blur-xl"
    >
      <div className="flex items-center justify-around px-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', minHeight: '64px' }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors duration-200 ${
                isActive
                  ? 'text-accent'
                  : 'text-muted-foreground'
              }`}
              style={{ minHeight: '64px', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
              aria-label={tab.label}
            >
              <div className={`flex items-center justify-center ${isActive ? 'scale-110' : ''}`} style={{ height: '24px' }}>
                {tab.icon}
              </div>
              <span className="text-[10px] font-medium leading-tight mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

