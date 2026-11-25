"use client";

import { useCallback, useEffect, useState } from "react";
import type { CanvasTheme } from "@repo/engine";

const STORAGE_KEY = "excalidraw:theme";

export function readStoredTheme(): CanvasTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

export function applyDocumentTheme(theme: CanvasTheme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors in restricted browsing contexts.
    }
  }
}

export function useCanvasTheme(initialTheme?: CanvasTheme) {
  const [theme, setThemeState] = useState<CanvasTheme>(initialTheme ?? "dark");

  useEffect(() => {
    const current = initialTheme ?? readStoredTheme();
    setThemeState(current);
    applyDocumentTheme(current);
  }, [initialTheme]);

  const setTheme = useCallback((next: CanvasTheme) => {
    setThemeState(next);
    applyDocumentTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: CanvasTheme = prev === "dark" ? "light" : "dark";
      applyDocumentTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
