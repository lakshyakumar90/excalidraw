"use client";

import { useRef, useState } from "react";

interface PaletteColor {
  name: string;
  value: string;
}

interface ColorPickerProps {
  label: string;
  value: string;
  recentColors: readonly string[];
  eyedropperActive: boolean;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
  onPickFromCanvas: () => void;
}

const PALETTE_COLORS: PaletteColor[] = [
  { name: "Black", value: "#1e1e1e" },
  { name: "Dark gray", value: "#495057" },
  { name: "Gray", value: "#868e96" },
  { name: "Light gray", value: "#ced4da" },
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#e03131" },
  { name: "Coral", value: "#f76707" },
  { name: "Orange", value: "#f08c00" },
  { name: "Yellow", value: "#f2c94c" },
  { name: "Lime", value: "#82c91e" },
  { name: "Green", value: "#2f9e44" },
  { name: "Teal", value: "#12b886" },
  { name: "Cyan", value: "#15aabf" },
  { name: "Blue", value: "#228be6" },
  { name: "Indigo", value: "#4c6ef5" },
  { name: "Purple", value: "#7950f2" },
  { name: "Violet", value: "#be4bdb" },
  { name: "Pink", value: "#e64980" },
];

const GRID_COLUMNS = 9;

function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().startsWith("#")
    ? value.trim()
    : `#${value.trim()}`;

  if (/^#[\da-f]{6}$/i.test(normalized)) return normalized.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((character) => character + character)
      .join("")}`.toLowerCase();
  }

  return null;
}

function ColorGrid({
  label,
  colors,
  value,
  onSelect,
}: {
  label: string;
  colors: PaletteColor[];
  value: string;
  onSelect: (color: string) => void;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState(() =>
    Math.max(
      0,
      colors.findIndex((color) => color.value === value),
    ),
  );

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = Math.min(index + 1, colors.length - 1);
        break;
      case "ArrowLeft":
        nextIndex = Math.max(index - 1, 0);
        break;
      case "ArrowDown":
        nextIndex = Math.min(index + GRID_COLUMNS, colors.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(index - GRID_COLUMNS, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = colors.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setFocusedIndex(nextIndex);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="grid grid-cols-6 gap-2">
      {colors.map((color, index) => (
        <button
          key={`${color.value}-${index}`}
          ref={(element) => {
            buttonRefs.current[index] = element;
          }}
          type="button"
          aria-label={`${color.name}, ${color.value}`}
          aria-pressed={value === color.value}
          title={`${color.name} ${color.value}`}
          tabIndex={index === focusedIndex ? 0 : -1}
          onFocus={() => setFocusedIndex(index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onClick={() => onSelect(color.value)}
          className={`h-7 w-7 rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
            value === color.value
              ? "border-indigo-600 ring-1 ring-indigo-500"
              : "border-black/10 hover:scale-105 hover:border-black/30"
          }`}
          style={{ backgroundColor: color.value }}
        />
      ))}
    </div>
  );
}

export function ColorPicker({
  label,
  value,
  recentColors,
  eyedropperActive,
  onChange,
  onCommit,
  onPickFromCanvas,
}: ColorPickerProps) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const hexInput = hexDraft ?? value;

  const commitHexInput = () => {
    const color = normalizeHexColor(hexInput);
    if (!color) {
      setHexDraft(null);
      return;
    }
    onChange(color);
    onCommit(color);
    setHexDraft(null);
  };

  const selectColor = (color: string) => {
    onChange(color);
    onCommit(color);
  };

  const recentPalette = recentColors.map((color, index) => ({
    name: `Recent color ${index + 1}`,
    value: color,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-700">{label}</span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <input
            aria-label={`${label} hex color`}
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            maxLength={7}
            value={hexInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setHexDraft(nextValue);
              const color = normalizeHexColor(nextValue);
              if (color) onChange(color);
            }}
            onBlur={commitHexInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitHexInput();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setHexDraft(null);
                event.currentTarget.blur();
              }
            }}
            className="h-8 w-16 rounded-md border border-neutral-200 bg-white px-2 font-mono text-xs uppercase text-neutral-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <input
            aria-label={`${label} color picker`}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={(event) => onCommit(event.currentTarget.value)}
            className="h-8 w-9 cursor-pointer rounded-md border border-neutral-200 bg-white p-1"
          />
          <button
            type="button"
            aria-label={`Pick ${label.toLowerCase()} from canvas`}
            aria-pressed={eyedropperActive}
            title="Pick a color from the canvas"
            onClick={onPickFromCanvas}
            className={`grid h-8 w-8 place-items-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              eyedropperActive
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m14 6 4 4M4 20l4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
              <path d="m13 7 4 4" />
            </svg>
          </button>
        </div>
      </div>

      <ColorGrid
        label={`${label} color palette`}
        colors={PALETTE_COLORS}
        value={value}
        onSelect={selectColor}
      />

      {recentPalette.length > 0 && (
        <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-neutral-500">Recent</p>
          <ColorGrid
            label={`Recent ${label.toLowerCase()} colors`}
            colors={recentPalette}
            value={value}
            onSelect={selectColor}
          />
        </div>
      )}
    </div>
  );
}
