import { BrandDeadEnd } from '@/components/states/BrandDeadEnd';
import { SIGNED_IN_HINT_SCRIPT } from '@/lib/auth/notFoundRecovery';

/**
 * Server-rendered 404 copy stays in the HTML for crawlers and signed-out visitors.
 * A signed-in hint (set before paint) hides that copy and shows a quiet spinner
 * until the owner check fails or times out. The hint is not a credential.
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
      <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_HINT_SCRIPT }} />
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
