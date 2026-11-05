import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsDiagram } from "@/components/docs/DocsDiagram";
import { DocsMarkdown } from "@/components/docs/DocsMarkdown";
import { docBySlug, docsEntries, docsHref } from "@/lib/docsCatalog";
import { readDocsPage } from "@/lib/docsContent";

type PageProps = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return docsEntries.map((entry) => ({ slug: entry.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = docBySlug.get(slug.join("/"));
  if (!entry) return { title: "Not found" };
  return { title: `${entry.title} · Project docs`, description: entry.description };
}

function getTableOfContents(markdown: string) {
  const body = markdown.replace(/```[\s\S]*?```/g, "");
  const used = new Map<string, number>();
  return [...body.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((match) => {
    const title = (match[2] ?? "").trim();
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return { level: match[1]?.length ?? 2, title, id: count ? `${base}-${count}` : base };
  });
}

function TableOfContents({ items }: { items: ReturnType<typeof getTableOfContents> }) {
  if (items.length === 0) return null;
  return (
    <aside className="docs-toc" aria-label="On this page">
      <p>On this page</p>
      <nav>{items.map((item) => <a className={item.level === 3 ? "is-nested" : ""} href={`#${item.id}`} key={`${item.id}-${item.title}`}>{item.title}</a>)}</nav>
    </aside>
  );
}

export default async function DocsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const page = await readDocsPage(slug.join("/"));
  if (!page) notFound();
  const { entry, content } = page;
  const toc = entry.kind === "diagram" ? [] : getTableOfContents(content);
  const groupLink = entry.kind === "diagram" ? docsHref("diagrams/system-architecture") : "/docs";

  return (
    <div className="docs-reading-layout">
      <article className="docs-article">
        <div className="docs-breadcrumb"><Link href="/docs">Documentation</Link><span aria-hidden="true">/</span><Link href={groupLink}>{entry.group}</Link><span aria-hidden="true">/</span><span>{entry.title}</span></div>
        {entry.kind === "diagram" ? (
          <>
            <header className="docs-article-heading"><p className="docs-article-kicker">Visual reference · Mermaid</p><h1>{entry.title}</h1><p>{entry.description}</p></header>
            <DocsDiagram chart={content} title={entry.title} />
            <div className="docs-diagram-explainer"><h2>How to read this diagram</h2><p>Follow the arrows to trace ownership and data movement. Dashed arrows represent optional integrations or documented alternatives. The full source is available below the rendered diagram.</p></div>
          </>
        ) : (
          <>
            <header className="docs-article-meta"><span>{entry.group}</span><span>Source-checked project notes</span></header>
            <DocsMarkdown content={content} sourcePath={entry.sourcePath} />
          </>
        )}
        <footer className="docs-article-footer">
          <Link href="/docs">← Documentation home</Link>
          <Link href={docsHref(entry.kind === "diagram" ? "architecture" : "improvement-proposals")}>{entry.kind === "diagram" ? "Read the architecture notes" : "Explore improvement proposals"} →</Link>
        </footer>
      </article>
      <TableOfContents items={toc} />
    </div>
  );
}
