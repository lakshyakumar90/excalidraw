import type { ToolType } from "@repo/engine";
import { TOOL_LABELS, TOOL_SHORTCUTS } from "@/lib/tools/toolDefinitions";
import { ToolIcon } from "./ToolIcon";

export function ToolButton({
  type,
  active,
  onClick,
}: {
  type: ToolType;
  active: boolean;
  onClick: () => void;
}) {
  const label = TOOL_LABELS[type];
  const tooltip =
    type === "selection"
      ? `${label} · ${TOOL_SHORTCUTS[type]} · Alt-click cycles overlaps`
      : `${label} · ${TOOL_SHORTCUTS[type]}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts={TOOL_SHORTCUTS[type]}
      aria-pressed={active}
      tabIndex={active ? 0 : -1}
      className={[
        "group relative grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-700 hover:bg-neutral-100",
      ].join(" ")}
    >
      <ToolIcon type={type} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-[60] hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block"
      >
        {tooltip}
      </span>
    </button>
  );
}
