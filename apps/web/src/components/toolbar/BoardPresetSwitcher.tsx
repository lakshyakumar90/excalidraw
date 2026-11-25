"use client";

import { useEffect } from "react";
import {
  BOARD_PRESET_LIST,
  type BoardPresetId,
} from "@repo/common";

export interface BoardPresetSwitcherProps {
  value: BoardPresetId;
  onChange: (presetId: BoardPresetId, restyleExisting: boolean) => void;
  onFontsReady?: () => void;
}

export function BoardPresetSwitcher({
  value,
  onChange,
  onFontsReady,
}: BoardPresetSwitcherProps) {
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
      className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-2 py-1 shadow-sm backdrop-blur-md"
      role="group"
      aria-label="Board visual presets"
    >
      {BOARD_PRESET_LIST.map((preset) => {
        const selected = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id, false)}
            onDoubleClick={() => onChange(preset.id, true)}
            title={`${preset.name}: ${preset.description} (double-click to restyle board)`}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-white/25"
              style={{
                backgroundColor:
                  preset.canvasBackgroundDark ?? preset.palette[0],
              }}
            />
            <span>{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}
