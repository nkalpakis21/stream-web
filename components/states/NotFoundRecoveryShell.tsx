import { BrandDeadEnd } from '@/components/states/BrandDeadEnd';

/**
 * Server-rendered 404 copy stays in the HTML for crawlers and signed-out visitors.
 * The root layout's before-paint script hides that copy for a signed-in check.
 */
export function NotFoundRecoveryShell({
  line,
  children,
}: {
  line: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      {children}
      <div className="ss-not-found">
        <div className="ss-not-found-copy">
          <BrandDeadEnd line={line} />
        </div>
        <div className="ss-not-found-pending" aria-busy="true" aria-live="polite">
          <span className="ss-quiet-spinner" />
          <span className="sr-only">Loading</span>
        </div>
      </div>
    </>
  );
}
