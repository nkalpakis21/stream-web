'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { CoverImage } from '@/components/media/CoverImage';
import { getUser } from '@/lib/services/users';
import { getUserArtists } from '@/lib/services/artists';
import { getFollowers, getFollowing } from '@/lib/services/follows';
import { getInitials } from '@/lib/utils/avatar';

function fallbackName(user: User): string {
  return user.displayName || user.email?.split('@')[0] || 'You';
}

export function BagIdentity({ user }: { user: User }) {
  const [name, setName] = useState(fallbackName(user));
  const [photoURL, setPhotoURL] = useState<string | null>(user.photoURL);
  const [following, setFollowing] = useState(0);
  const [followers, setFollowers] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setName(fallbackName(user));
    setPhotoURL(user.photoURL);
    setFollowing(0);
    setFollowers(0);

    Promise.all([
      getUser(user.uid).catch(() => null),
      getFollowing(user.uid).catch(() => []),
      getUserArtists(user.uid).catch(() => []),
    ]).then(async ([doc, follows, artists]) => {
      if (cancelled) return;
      if (doc?.displayName?.trim()) setName(doc.displayName.trim());
      if (doc?.photoURL) setPhotoURL(doc.photoURL);
      setFollowing(follows.length);

      const lists = await Promise.all(
        artists.map(artist => getFollowers(artist.id).catch(() => []))
      );
      if (cancelled) return;
      const unique = new Set<string>();
      for (const list of lists) {
        for (const follow of list) unique.add(follow.followerId);
      }
      setFollowers(unique.size);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="bag-identity">
      <span className="bag-avatar">
        {photoURL ? (
          <CoverImage
            src={photoURL}
            title={name}
            sizes="56px"
            rounded="rounded-full"
          />
        ) : (
          <span className="bag-avatar-fallback">{getInitials(name)}</span>
        )}
      </span>
      <div className="min-w-0">
        <p className="bag-identity-name">{name}</p>
        <div className="bag-social">
          <Link href="/feed">
            <strong>{following}</strong> Following
          </Link>
          <Link href="/dashboard?tab=artists">
            <strong>{followers}</strong> Followers
          </Link>
        </div>
      </div>
    </div>
  );
}
