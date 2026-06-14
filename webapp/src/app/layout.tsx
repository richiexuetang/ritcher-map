import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { SITE_URL } from '@/lib/config';
import { AuthProvider } from '@/lib/auth/AuthContext';

const SITE_NAME = 'RitcherMap';
const SITE_DESCRIPTION =
  'Interactive game maps: track collectibles, locations and progress across your favorite games.';

export const metadata: Metadata = {
  // Absolute base for canonical + Open Graph URLs. Without this, social/search
  // crawlers see relative URLs and cards break.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RitcherMap — Interactive Game Maps',
    template: '%s | RitcherMap',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'RitcherMap — Interactive Game Maps',
    description: SITE_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RitcherMap — Interactive Game Maps',
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
