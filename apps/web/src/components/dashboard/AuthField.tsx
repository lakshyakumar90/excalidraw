import { useId, useState, type ComponentProps } from "react";

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
  return (
    <div className="block text-sm font-medium">
      <label htmlFor={fieldId}>{label}</label>
      <div className="relative mt-1.5">
        <input
          {...props}
          id={fieldId}
          type={password && visible ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`block min-h-11 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-left leading-5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 ${password ? "pr-12" : ""}`}
        />
        {password && (
          <button
            type="button"
            disabled={props.disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <svg
              width="20"
              height="20"
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
