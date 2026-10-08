import type { ReactNode } from "react";
import type { ToolType } from "@repo/engine";

export function ToolIcon({ type }: { type: ToolType }) {
  let shape: ReactNode;

  switch (type) {
    case "selection":
      shape = (
        <path
          d="M5 3v17l4.5-4.5 3 6 2.5-1.2-3-6H19L5 3Z"
          fill="currentColor"
          stroke="none"
        />
      );
      break;
    case "text":
      shape = (
        <>
          <path d="M4 6V4h16v2M12 4v16m-4 0h8" />
        </>
      );
      break;
    case "hand":
      shape = (
        <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10 4.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V12l.7-1.1a1.6 1.6 0 0 1 2.8 1.4l-2 5A4 4 0 0 1 14.8 20h-2.1a4 4 0 0 1-3.1-1.5L6.2 14a1.7 1.7 0 0 1 2.5-2.2L10 13" />
      );
      break;
    case "eraser":
      shape = (
        <path d="m7.2 20-4.3-4.3a2 2 0 0 1 0-2.8l9.9-9.9a2 2 0 0 1 2.8 0l5.5 5.5a2 2 0 0 1 0 2.8L12 20H7.2Zm4.8 0 4-4" />
      );
      break;
    case "rectangle":
      shape = <rect x="4" y="5" width="16" height="14" rx="1" />;
      break;
    case "ellipse":
      shape = <ellipse cx="12" cy="12" rx="8" ry="6.5" />;
      break;
    case "diamond":
      shape = <path d="m12 3 9 9-9 9-9-9 9-9Z" />;
      break;
    case "line":
      shape = <path d="m5 19 14-14" />;
      break;
    case "multiPointLine":
      shape = (
        <>
          <path d="m4 18 6-11 4 8 6-9" />
          <circle cx="4" cy="18" r="1.2" fill="currentColor" />
          <circle cx="10" cy="7" r="1.2" fill="currentColor" />
          <circle cx="14" cy="15" r="1.2" fill="currentColor" />
          <circle cx="20" cy="6" r="1.2" fill="currentColor" />
        </>
      );
      break;
    case "arrow":
      shape = <path d="M4 12h15m-6-6 6 6-6 6" />;
      break;
    case "curved-line":
      shape = <path d="M4 17c4-12 12-12 16-2" />;
      break;
    case "freedraw":
      shape = <path d="M4 17c2-8 4 5 7-2s4-8 5-3 3 5 4-3" />;
      break;
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
}
