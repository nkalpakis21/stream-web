'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  variant?: 'default' | 'compact' | 'full';
  showText?: boolean;
  className?: string;
}

export function Logo({ variant = 'default', showText = true, className = '' }: LogoProps) {
  const isCompact = variant === 'compact';
  const isFull = variant === 'full';

  return (
    <Link 
      href="/" 
      className={`flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity flex-shrink-0 ${className}`}
      aria-label="Stream ⭐ - Home"
    >
      <div className={`relative flex-shrink-0 ${
        isCompact ? 'w-6 h-6 sm:w-7 sm:h-7' : 
        isFull ? 'w-10 h-10 sm:w-12 sm:h-12' : 
        'w-8 h-8 sm:w-9 sm:h-9'
      }`}>
        <Image
          src="/logo.png"
          alt="Stream ⭐ Logo"
          fill
          className="object-contain"
          priority
          sizes="(max-width: 640px) 32px, 36px"
        />
      </div>
      {showText && (
        <span className={`font-space-grotesk font-semibold tracking-tight ${
          isCompact ? 'text-lg sm:text-xl' : 
          isFull ? 'text-xl sm:text-2xl' : 
          'text-xl sm:text-2xl'
        }`}>
          Stream ⭐
        </span>
      )}
    </Link>
  );
}

