'use client';

import { useEffect, useState } from 'react';
import { getAnalytics, isSupported, logEvent, Analytics } from 'firebase/analytics';
import { usePathname } from 'next/navigation';
import { getApps } from 'firebase/app';
import firebaseApp from '@/lib/firebase/config';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [analyticsInstance, setAnalyticsInstance] = useState<Analytics | null>(null);

  useEffect(() => {
    // Initialize Analytics
    const initAnalytics = async () => {
      if (typeof window === 'undefined') return;

      try {
        const supported = await isSupported();
        if (supported) {
          // Get Firebase app instance (already initialized by config)
          const apps = getApps();
          const app = apps.length > 0 ? apps[0] : firebaseApp;
          const analytics = getAnalytics(app);
          setAnalyticsInstance(analytics);
        }
      } catch (error) {
        console.error('Failed to initialize Firebase Analytics:', error);
      }
    };

    initAnalytics();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (analyticsInstance && pathname) {
      logEvent(analyticsInstance, 'page_view', {
        page_path: pathname,
        page_title: document.title,
      });
    }
  }, [analyticsInstance, pathname]);

  return <>{children}</>;
}

