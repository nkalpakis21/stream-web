import type { MetadataRoute } from 'next';
import { getPublicArtists } from '@/lib/services/artists';
import { getPublicSongs } from '@/lib/services/songs';
import { publicUrl } from '@/lib/brand/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [songs, artists] = await Promise.all([
    getPublicSongs(200).catch(() => []),
    getPublicArtists(200).catch(() => []),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: publicUrl('/'), changeFrequency: 'hourly', priority: 1 },
    { url: publicUrl('/discover'), changeFrequency: 'hourly', priority: 0.9 },
    { url: publicUrl('/artists'), changeFrequency: 'daily', priority: 0.8 },
    { url: publicUrl('/terms'), changeFrequency: 'yearly', priority: 0.3 },
    { url: publicUrl('/privacy'), changeFrequency: 'yearly', priority: 0.3 },
  ];

  const songRoutes = songs.map(song => ({
    url: publicUrl(`/songs/${song.id}`),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const artistRoutes = artists.map(artist => ({
    url: publicUrl(`/artists/${artist.id}`),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...songRoutes, ...artistRoutes];
}
