import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/brand/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/signin', '/signup', '/dashboard', '/feed', '/chat', '/investing', '/me', '/create'],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
