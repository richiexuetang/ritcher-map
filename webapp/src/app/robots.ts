import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

// Generates /robots.txt. Crawlers may index public game + map pages; the CMS
// (/admin) and internal API routes are kept out of the index. The sitemap
// pointer is how Google discovers every map URL.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
