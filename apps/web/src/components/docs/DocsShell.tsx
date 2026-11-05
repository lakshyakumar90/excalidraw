"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { docsEntries, docsHref, type DocsEntry } from "@/lib/docsCatalog";

type SearchEntry = Pick<DocsEntry, "slug" | "title" | "description" | "group"> & { searchText?: string };

export function DocsShell({ children, searchIndex }: { children: React.ReactNode; searchIndex: SearchEntry[] }) {
  const pathname = usePathname();
  const activeSlug = pathname.replace(/^\/docs\/?/, "") || "home";
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return searchIndex
      .filter((entry) => `${entry.title} ${entry.description} ${entry.group} ${entry.searchText ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 7);
  }, [query, searchIndex]);

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

  return (
    <div className="docs-app">
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
        <Link className="docs-back-link" href="/">Open drawing app <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="docs-frame">
        {mobileOpen && <button className="docs-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
        <aside className={`docs-sidebar${mobileOpen ? " is-open" : ""}`} aria-label="Documentation navigation">
          <div className="docs-sidebar-scroll">
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
