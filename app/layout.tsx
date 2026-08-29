import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Figtree, Playfair_Display } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { SongPlayerProvider } from '@/components/songs/SongPlayerProvider';
import { AnalyticsProvider } from '@/components/providers/AnalyticsProvider';
import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/navigation/SiteHeader';
import { MobileTabBar } from '@/components/navigation/MobileTabBar';

const SolanaWalletProvider = dynamic(
  () =>
    import('@/components/providers/SolanaWalletProvider').then(
      (mod) => mod.SolanaWalletProvider
    ),
  { ssr: false }
);

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Streamstar',
    template: '%s · Streamstar',
  },
  description: 'Listen, create, trade.',
  applicationName: 'Streamstar',
  icons: {
    icon: [
      { url: '/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Streamstar',
    description: 'Listen, create, trade.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Streamstar' }],
  },
  twitter: {
    card: 'summary',
    title: 'Streamstar',
    description: 'Listen, create, trade.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${figtree.variable} ${playfairDisplay.variable}`}>
      <body className="antialiased flex flex-col min-h-screen overflow-x-hidden">
        <AnalyticsProvider>
          <AuthProvider>
            <SolanaWalletProvider>
              <SongPlayerProvider>
                <SiteHeader />
                <div className="flex-1 pb-24 md:pb-0">{children}</div>
                <Footer />
                <MobileTabBar />
              </SongPlayerProvider>
            </SolanaWalletProvider>
          </AuthProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
