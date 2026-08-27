import { InvestingPageClient } from '@/components/investing/InvestingPageClient';

export const metadata = {
  title: 'Investing — Streamstar',
  description: 'Authorized investor access.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function InvestingPage() {
  return <InvestingPageClient />;
}
