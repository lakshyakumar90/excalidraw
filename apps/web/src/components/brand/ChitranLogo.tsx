export function ChitranMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

export function ChitranBrand({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-fg)]">
        <ChitranMark className="h-3.5 w-3.5" />
      </span>
      {showWordmark && (
        <span className="font-semibold tracking-tight text-[var(--text-primary)]">
          Chitran
        </span>
      )}
    </span>
  );
}
