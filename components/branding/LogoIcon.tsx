'use client';

import Image from 'next/image';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 24, className = '' }: LogoIconProps) {
  return (
    <div 
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="Stream ⭐"
        fill
        className="object-contain"
        priority
        sizes={`${size}px`}
      />
    </div>
  );
}


