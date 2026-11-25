"use client";

import { useEffect, useState } from "react";
import {
  BOARD_PRESET_LIST,
  type BoardPresetId,
} from "@repo/common";
import type { CanvasTheme } from "@repo/engine";

export interface BoardPresetSwitcherProps {
  value: BoardPresetId;
  theme?: CanvasTheme;
  onToggleTheme?: () => void;
  onChange: (presetId: BoardPresetId, restyleExisting: boolean) => void;
  onFontsReady?: () => void;
}

export function BoardPresetSwitcher({
  value,
  theme = "dark",
  onToggleTheme,
  onChange,
  onFontsReady,
}: BoardPresetSwitcherProps) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) onFontsReady?.();
    });
    return () => {
      active = false;
    };
  }, [value, onFontsReady]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex h-9 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 p-1 shadow-xl backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      role="group"
      aria-label="Board visual presets"
    >
      {BOARD_PRESET_LIST.map((preset) => {
        const selected = preset.id === value;
        const visible = hovered || selected;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id, false)}
            onDoubleClick={() => onChange(preset.id, true)}
            title={`${preset.name}: ${preset.description} (double-click to restyle board)`}
            className={`whitespace-nowrap rounded-lg py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              selected && hovered
                ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs"
                : selected
                  ? "text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            } ${
              visible
                ? "mx-0.5 max-w-[140px] px-2.5 opacity-100"
                : "mx-0 max-w-0 overflow-hidden px-0 opacity-0 pointer-events-none"
            }`}
          >
            {preset.name}
          </button>
        );
      })}
      {onToggleTheme && (
        <div
          className={`flex items-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            hovered ? "max-w-12 opacity-100" : "max-w-0 opacity-0 pointer-events-none"
          }`}
        >
          <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
            aria-label="Toggle canvas theme"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      )}
    </div>
  );
}
