export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="group border-t border-neutral-200 pt-3">
      <summary className="mb-3 flex cursor-pointer list-none items-center justify-between rounded-sm text-xs font-medium text-neutral-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">
        {title}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="h-4 w-4 transition-transform group-open:rotate-180"
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
    <label className="flex min-h-9 items-center justify-between gap-3 text-xs text-neutral-700">
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
    <div role="group" aria-label={label} className="flex gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={`grid h-9 w-9 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            value === option.value
              ? "border-indigo-300 bg-indigo-100 text-indigo-950"
              : "border-neutral-200 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950"
          }`}
        >
          {option.mark ?? <span className="text-[10px]">{option.label}</span>}
        </button>
      ))}
    </div>
  );
}
