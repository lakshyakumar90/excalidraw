import { readDocsSource } from "./docsContent";

export interface DocsFileEntry {
  path: string;
  purpose: string;
}

export interface DocsFileGroup {
  folder: string;
  label: string;
  files: DocsFileEntry[];
}

const FOLDER_LABELS: Record<string, string> = {
  apps: "apps/ — runnable services",
  packages: "packages/ — shared libraries",
  docs: "docs/ — project notes and runbooks",
  notes: "notes/ — upgrade implementation records",
  ".github": ".github/ — automation",
  root: "Repository root",
};

/** Groups the tracked-file catalog into folder accordions for the docs home. */
export async function getDocsFileGroups(): Promise<DocsFileGroup[]> {
  const markdown = await readDocsSource("project-notes/04-file-catalog.md");
  const groups = new Map<string, DocsFileEntry[]>();

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|$/);
    if (!match) continue;
    const [, rawPath, purpose] = match;
    if (!rawPath) continue;
    const segments = rawPath.split("/");
    const folder =
      segments[0] === "apps" || segments[0] === "packages"
        ? segments.slice(0, 2).join("/")
        : (segments[0] ?? "root");
    const files = groups.get(folder) ?? [];
    files.push({ path: rawPath, purpose: purpose || "Source or configuration file" });
    groups.set(folder, files);
  }

  return [...groups.entries()]
    .map(([folder, files]) => ({ folder, label: FOLDER_LABELS[folder] ?? `${folder}/`, files }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}
