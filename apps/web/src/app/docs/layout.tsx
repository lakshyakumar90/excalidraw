import { DocsShell } from "@/components/docs/DocsShell";
import { getDocsSearchIndex } from "@/lib/docsContent";
import "./docs.css";

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const searchIndex = await getDocsSearchIndex();
  return <DocsShell searchIndex={searchIndex}>{children}</DocsShell>;
}
