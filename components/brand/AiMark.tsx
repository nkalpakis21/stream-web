export function AiMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${className}`}
      style={{
        color: 'var(--mute)',
        border: '1px solid var(--line)',
        background: 'var(--surface)',
      }}
    >
      AI
    </span>
  );
}
