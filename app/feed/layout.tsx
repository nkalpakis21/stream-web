import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Feed',
  robots: { index: false, follow: false },
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
