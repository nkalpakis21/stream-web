export function CoverModerationNoticeView({
  message,
  buttonLabel,
  busy = false,
  onClick,
}: {
  message: string;
  buttonLabel: string;
  busy?: boolean;
  onClick?: () => void;
}) {
  return (
    <div data-owner-cover-note="">
      <p className="text-sm" style={{ color: 'var(--mute)' }}>
        {message}
      </p>
      <button
        type="button"
        className="listen-btn-primary mt-2"
        style={{ minHeight: 44 }}
        disabled={busy}
        onClick={onClick}
      >
        {busy ? 'Checking…' : buttonLabel}
      </button>
    </div>
  );
}
