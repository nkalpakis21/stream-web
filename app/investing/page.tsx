import { InvestingPageClient } from '@/components/investing/InvestingPageClient';

export const metadata = {
  title: 'Investing — Streamstar',
  description: 'Manage AI artists. Own the catalog.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function InvestingPage() {
  return <InvestingPageClient />;
}
