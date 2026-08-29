import Image from 'next/image';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 32, className = '' }: LogoIconProps) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className={`flex-shrink-0 ${className}`}
      priority
    />
  );
}
