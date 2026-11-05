import { readFile } from "node:fs/promises";
import path from "node:path";
import { docBySlug, docsEntries } from "./docsCatalog";

const contentRoot = path.resolve(process.cwd(), "../../docs");

export async function readDocsSource(sourcePath: string) {
  const normalized = path.posix.normalize(sourcePath.replaceAll("\\", "/"));
  if (normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error("Invalid documentation source path.");
  }
  return readFile(path.join(contentRoot, ...normalized.split("/")), "utf8");
}

export async function readDocsPage(slug: string) {
  const entry = docBySlug.get(slug);
  if (!entry) return null;
  return { entry, content: await readDocsSource(entry.sourcePath) };
}

export async function getDocsSearchIndex() {
  return Promise.all(
    docsEntries.map(async ({ slug, title, description, sourcePath, group, kind }) => {
      if (kind === "diagram") return { slug, title, description, group };
      try {
        const content = await readDocsSource(sourcePath);
        const searchText = content
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/[#>*`|_[\[\]()]/g, " ")
          .replace(/\s+/g, " ");
        return { slug, title, description, group, searchText };
      } catch {
        return { slug, title, description, group };
      }
    }),
  );
}
