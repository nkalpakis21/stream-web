import type { Metadata } from 'next';
import { XConnectConfigProvider } from '@/components/artists/XConnectConfig';
import { isXConfigured } from '@/lib/x/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <XConnectConfigProvider configured={isXConfigured()}>
      {children}
    </XConnectConfigProvider>
  );
}
