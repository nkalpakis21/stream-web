import Link from 'next/link';
import { listenPrimaryClass } from '@/components/states/BrandDeadEnd';

interface EmptyActionProps {
  message?: string;
  label: string;
  href?: string;
  onClick?: () => void;
}

export function EmptyAction({ message, label, href, onClick }: EmptyActionProps) {
  const action = href ? (
    <Link href={href} className={listenPrimaryClass}>
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={listenPrimaryClass}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {action}
    </div>
  );
}
