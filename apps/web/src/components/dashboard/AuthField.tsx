import type { ComponentProps } from "react";

export function AuthField({
  label,
  value,
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "onChange"> & {
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 block min-h-11 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-left leading-5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
      />
    </label>
  );
}
