import { useId, useState, type ComponentProps } from "react";

function FieldIcon({ kind }: { kind: "email" | "password" | "user" }) {
  if (kind === "email") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m4 7 8 5.5L20 7" />
      </svg>
    );
  }
  if (kind === "password") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type,
  id,
  ...props
}: Omit<ComponentProps<"input">, "onChange"> & {
  label: string;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  const iconKind: "email" | "password" | "user" =
    type === "email" ? "email" : password ? "password" : "user";

  return (
    <div className="block text-xs font-medium text-[var(--text-primary)]">
      <label htmlFor={fieldId} className="block text-[var(--text-muted)]">
        {label}
      </label>
      <div className="relative mt-1.5">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-[var(--text-muted)]">
          <FieldIcon kind={iconKind} />
        </span>
        <input
          {...props}
          id={fieldId}
          type={password && visible ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`block h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] pl-10 pr-3 text-sm font-normal text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--border-soft)] focus:ring-2 focus:ring-[var(--focus-ring)] ${password ? "pr-11" : ""}`}
        />
        {password && (
          <button
            type="button"
            disabled={props.disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {visible && <path d="M3 3l18 18" />}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
