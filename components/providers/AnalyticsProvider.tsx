'use client';

import { useEffect, useState } from 'react';
import { getAnalytics, isSupported, logEvent, Analytics } from 'firebase/analytics';
import { usePathname } from 'next/navigation';
import { getApp } from '@/lib/firebase/config';

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
          const app = getApp();
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

