'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';

interface HeroCTAProps {
  variant?: 'default' | 'hero';
}

export function HeroCTA({ variant = 'default' }: HeroCTAProps) {
  const { user } = useAuth();
  const router = useRouter();

  const isHero = variant === 'hero';
  const buttonClass = isHero
    ? 'inline-flex items-center gap-2 px-6 py-3 lg:px-8 lg:py-4 text-base lg:text-lg font-semibold bg-white text-gray-900 rounded-lg hover:bg-white/90 transition-opacity shadow-lg'
    : 'inline-flex items-center gap-2 px-6 py-3 lg:px-8 lg:py-4 text-base lg:text-lg font-semibold bg-accent text-accent-foreground rounded-full hover:opacity-90 transition-opacity shadow-soft';

  const handleClick = () => {
    if (user) {
      router.push('/dashboard?tab=songs');
    }
  };

  if (user) {
    return (
      <button onClick={handleClick} className={buttonClass}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Now for Free
      </button>
    );
  }

  return (
    <Link href="/signin" className={buttonClass}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Create Now for Free
    </Link>
  );
}

