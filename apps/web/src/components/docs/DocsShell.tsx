"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { docsEntries, docsHref, type DocsEntry } from "@/lib/docsCatalog";

type SearchEntry = Pick<DocsEntry, "slug" | "title" | "description" | "group"> & { searchText?: string };
type DocsTheme = "light" | "dark";
type DocsFont = "sans" | "mono";

const THEME_KEY = "excalidraw-docs-theme";
const FONT_KEY = "excalidraw-docs-font";

const themeListeners = new Set<() => void>();
const fontListeners = new Set<() => void>();

function getThemeSnapshot(): DocsTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.docsTheme === "dark" ? "dark" : "light";
}

function getFontSnapshot(): DocsFont {
  if (typeof document === "undefined") return "sans";
  return document.documentElement.dataset.docsFont === "mono" ? "mono" : "sans";
}

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function subscribeFont(listener: () => void) {
  fontListeners.add(listener);
  return () => fontListeners.delete(listener);
}

function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the setting still applies for this view.
  }
}

export function DocsShell({ children, searchIndex }: { children: React.ReactNode; searchIndex: SearchEntry[] }) {
  const pathname = usePathname();
  const activeSlug = pathname.replace(/^\/docs\/?/, "") || "home";
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "light");
  const font = useSyncExternalStore(subscribeFont, getFontSnapshot, () => "sans");
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return searchIndex
      .filter((entry) => `${entry.title} ${entry.description} ${entry.group} ${entry.searchText ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 7);
  }, [query, searchIndex]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMobileOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const grouped = new Map<string, DocsEntry[]>();
  for (const entry of docsEntries) {
    const items = grouped.get(entry.group) ?? [];
    items.push(entry);
    grouped.set(entry.group, items);
  }

  const toggleTheme = () => {
    const next: DocsTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.docsTheme = next;
    persist(THEME_KEY, next);
    for (const listener of themeListeners) listener();
  };

  const toggleFont = () => {
    const next: DocsFont = font === "mono" ? "sans" : "mono";
    document.documentElement.dataset.docsFont = next;
    persist(FONT_KEY, next);
    for (const listener of fontListeners) listener();
  };

  return (
    <div className="docs-app" data-theme={theme} data-font={font} suppressHydrationWarning>
      <header className="docs-topbar">
        <button className="docs-menu-button" type="button" aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close documentation navigation" : "Open documentation navigation"} onClick={() => setMobileOpen((open) => !open)}>
          <span aria-hidden="true">{mobileOpen ? "×" : "☰"}</span>
        </button>
        <Link className="docs-brand" href="/docs" aria-label="Excalidraw project documentation home">
          <span className="docs-brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>Project docs</span>
        </Link>
        <div className="docs-search-wrap">
          <label className="docs-search">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.8" /><path d="m13.1 13.1 4 4" /></svg>
            <input ref={searchRef} type="search" role="combobox" aria-autocomplete="list" aria-controls="docs-search-results" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search the docs" aria-label="Search documentation" aria-expanded={query.length > 0} />
            <kbd>Ctrl K</kbd>
          </label>
          {query && (
            <div id="docs-search-results" className="docs-search-results" role="listbox" aria-label="Documentation search results">
              {results.length ? results.map((result) => (
                <Link role="option" aria-selected="false" key={result.slug} href={docsHref(result.slug)} onClick={() => setQuery("")}>
                  <span>{result.title}</span><small>{result.group}</small>
                </Link>
              )) : <p>No matching pages. Try “database” or “room”.</p>}
            </div>
          )}
        </div>
        <div className="docs-topbar-actions">
          <button className="docs-font-toggle" type="button" aria-pressed={font === "mono"} aria-label={font === "mono" ? "Use the sans reading font" : "Use the monospace reading font"} title={font === "mono" ? "Sans font" : "Monospace font"} onClick={toggleFont}>
            Aa
          </button>
          <button className="docs-theme-toggle" type="button" aria-pressed={theme === "dark"} aria-label={theme === "dark" ? "Switch documentation to light mode" : "Switch documentation to dark mode"} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
            {theme === "dark" ? <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5" /><path d="M10 1.8v2M10 16.2v2M18.2 10h-2M3.8 10h-2m14-5.8-1.4 1.4m-8.8 8.8-1.4 1.4m11.6 0-1.4-1.4m-8.8-8.8L4.4 4.2" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.8 12.7A7.2 7.2 0 0 1 7.3 3.2 7.3 7.3 0 1 0 16.8 12.7Z" /></svg>}
          </button>
          <Link className="docs-back-link" href="/">Open drawing app <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <div className="docs-frame">
        {mobileOpen && <button className="docs-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
        <aside className={`docs-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="Documentation navigation">
          <div className="docs-sidebar-scroll">
            <button className="docs-sidebar-close" type="button" aria-label="Close documentation navigation" onClick={() => setMobileOpen(false)}>×</button>
            <Link href="/docs" className={`docs-home-link${activeSlug === "home" ? " is-active" : ""}`} onClick={() => setMobileOpen(false)}>
              <span className="docs-home-icon" aria-hidden="true">⌂</span> Docs home
            </Link>
            {[...grouped.entries()].map(([group, entries]) => (
              <section className="docs-nav-group" key={group}>
                <h2>{group}</h2>
                {entries.map((entry) => (
                  <Link key={entry.slug} className={`docs-nav-link${activeSlug === entry.slug ? " is-active" : ""}`} href={docsHref(entry.slug)} onClick={() => setMobileOpen(false)}>
                    {entry.kind === "diagram" && <span className="docs-nav-diagram" aria-hidden="true">⌘</span>}
                    <span>{entry.title}</span>
                  </Link>
                ))}
              </section>
            ))}
            <p className="docs-sidebar-note">Built from the project source and maintained notes.</p>
          </div>
        </aside>
        <main className="docs-main">{children}</main>
      </div>
    </div>
  );
}
