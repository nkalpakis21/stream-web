'use client';

import { createContext, useContext } from 'react';

const XConnectConfigContext = createContext(false);

/** `configured` comes from the server. The client never sees key values. */
export function XConnectConfigProvider({
  configured,
  children,
}: {
  configured: boolean;
  children: React.ReactNode;
}) {
  return (
    <XConnectConfigContext.Provider value={configured}>
      {children}
    </XConnectConfigContext.Provider>
  );
}

export function useXConfigured(): boolean {
  return useContext(XConnectConfigContext);
}
