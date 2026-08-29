import Link from 'next/link';
import { LogoIcon } from '@/components/branding/LogoIcon';

interface LogoProps {
  variant?: 'default' | 'compact' | 'full';
  showText?: boolean;
  className?: string;
}

export function Logo({ variant = 'default', showText = true, className = '' }: LogoProps) {
  const isCompact = variant === 'compact';
  const iconSize = isCompact ? 28 : variant === 'full' ? 40 : 32;

  return (
    <Link
      href="/"
      className={`flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0 min-w-0 ${className}`}
      aria-label="Streamstar home"
    >
      <LogoIcon size={iconSize} />
      {showText && (
        <span
          className={`font-semibold tracking-tight text-foreground truncate ${
            isCompact ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
          }`}
        >
          Streamstar
        </span>
      )}
    </Link>
  );
}
