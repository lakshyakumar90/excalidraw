export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="group border-t border-[var(--border-subtle)] pt-2.5">
      <summary className="mb-2.5 flex cursor-pointer list-none items-center justify-between rounded-sm text-xs font-medium text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
        {title}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      {children}
    </details>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ChoiceGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; mark?: React.ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={`grid h-8 w-8 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
            value === option.value
              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          {option.mark ?? <span className="text-[10px]">{option.label}</span>}
        </button>
      ))}
    </div>
  );
}
