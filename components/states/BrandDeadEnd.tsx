import Link from 'next/link';
import { LogoIcon } from '@/components/branding/LogoIcon';

export const listenPrimaryClass =
  'inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground';
export const listenSecondaryClass =
  'inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground';

interface BrandDeadEndProps {
  line: string;
  children?: React.ReactNode;
}

export function BrandDeadEnd({ line, children }: BrandDeadEndProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <LogoIcon size={48} />
      <p className="mt-6 text-lg font-medium tracking-tight text-foreground">{line}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {children ?? (
          <>
            <Link href="/" className={listenPrimaryClass}>
              Play
            </Link>
            <Link href="/discover" className={listenSecondaryClass}>
              Discover
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
