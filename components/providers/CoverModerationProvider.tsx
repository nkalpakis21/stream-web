'use client';

import { createContext, useContext } from 'react';

const CoverModerationContext = createContext(false);

/** Server layout passes the flag. Missing provider means moderation is off. */
export function CoverModerationProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <CoverModerationContext.Provider value={enabled}>{children}</CoverModerationContext.Provider>;
}

export function useCoverModerationEnabled(): boolean {
  return useContext(CoverModerationContext);
}
