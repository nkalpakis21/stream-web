'use client';

import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import { getApps } from 'firebase/app';

export const ANALYTICS_EVENTS = {
  CTA_CREATE_HOME_LOGGED_OUT: 'cta_create_home_logged_out',
  CTA_CREATE_HEADER: 'cta_create_header',
  CREATE_SHEET_SONG: 'create_sheet_song',
  CREATE_SHEET_ARTIST: 'create_sheet_artist',
} as const;

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
) {
  void (async () => {
    try {
      if (typeof window === 'undefined') return;
      if (!(await isSupported())) return;
      const apps = getApps();
      if (apps.length === 0) return;
      logEvent(getAnalytics(apps[0]), name, params);
    } catch {
      // Analytics is optional in local/dev and must never block UI.
    }
  })();
}
