/**
 * Hooks for fetching and caching user display names
 */

import { useEffect, useState } from 'react';
import { getUserDisplayName, getUsersDisplayNames, getUsersData } from '@/lib/services/users';
import { getArtistsData } from '@/lib/services/artists';
import type { UserDocument } from '@/types/firestore';
import type { AIArtistDocument } from '@/types/firestore';

/**
 * Hook to fetch display name for a single user
 */
export function useUserDisplayName(userId: string | null | undefined): {
  displayName: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setDisplayName(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchDisplayName = async () => {
      setLoading(true);
      setError(null);

      try {
        const name = await getUserDisplayName(userId);
        if (!cancelled) {
          setDisplayName(name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch display name'));
          setDisplayName(`User ${userId.substring(0, 8)}...`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDisplayName();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { displayName, loading, error };
}

/**
 * Hook to batch fetch display names for multiple users
 */
export function useUsersDisplayNames(
  userIds: (string | null | undefined)[]
): {
  displayNames: Map<string, string>;
  loading: boolean;
  error: Error | null;
} {
  const [displayNames, setDisplayNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Filter out null/undefined and get unique IDs
    const validIds = Array.from(new Set(userIds.filter((id): id is string => !!id)));

    if (validIds.length === 0) {
      setDisplayNames(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchDisplayNames = async () => {
      setLoading(true);
      setError(null);

      try {
        const names = await getUsersDisplayNames(validIds);
        if (!cancelled) {
          setDisplayNames(names);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch display names'));
          // Set fallback names
          const fallbackNames = new Map<string, string>();
          validIds.forEach(id => {
            fallbackNames.set(id, `User ${id.substring(0, 8)}...`);
          });
          setDisplayNames(fallbackNames);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDisplayNames();

    return () => {
      cancelled = true;
    };
  }, [userIds.join(',')]); // Use join to create a stable dependency

  return { displayNames, loading, error };
}

/**
 * Hook to batch fetch full user documents for multiple users
 * Returns a Map of userId -> UserDocument (includes displayName, photoURL, etc.)
 */
export function useUsersData(
  userIds: (string | null | undefined)[]
): {
  usersData: Map<string, UserDocument>;
  loading: boolean;
  error: Error | null;
} {
  const [usersData, setUsersData] = useState<Map<string, UserDocument>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Filter out null/undefined and get unique IDs
    const validIds = Array.from(new Set(userIds.filter((id): id is string => !!id)));

    if (validIds.length === 0) {
      setUsersData(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchUsersData = async () => {
      setLoading(true);
      setError(null);

      try {
        const users = await getUsersData(validIds);
        if (!cancelled) {
          setUsersData(users);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch user data'));
          // Set empty map on error - components can handle fallback
          setUsersData(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUsersData();

    return () => {
      cancelled = true;
    };
  }, [userIds.join(',')]); // Use join to create a stable dependency

  return { usersData, loading, error };
}

/**
 * Hook to batch fetch full artist documents for multiple artists
 * Returns a Map of artistId -> AIArtistDocument (includes name, avatarURL, etc.)
 */
export function useArtistsData(
  artistIds: (string | null | undefined)[]
): {
  artistsData: Map<string, AIArtistDocument>;
  loading: boolean;
  error: Error | null;
} {
  const [artistsData, setArtistsData] = useState<Map<string, AIArtistDocument>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Filter out null/undefined and get unique IDs
    const validIds = Array.from(new Set(artistIds.filter((id): id is string => !!id)));

    if (validIds.length === 0) {
      setArtistsData(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchArtistsData = async () => {
      setLoading(true);
      setError(null);

      try {
        const artists = await getArtistsData(validIds);
        if (!cancelled) {
          setArtistsData(artists);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch artist data'));
          // Set empty map on error - components can handle fallback
          setArtistsData(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchArtistsData();

    return () => {
      cancelled = true;
    };
  }, [artistIds.join(',')]); // Use join to create a stable dependency

  return { artistsData, loading, error };
}
