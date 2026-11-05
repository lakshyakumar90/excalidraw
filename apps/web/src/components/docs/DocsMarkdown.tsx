import Link from "next/link";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { docBySourcePath, docsHref } from "@/lib/docsCatalog";
import { DocsDiagram } from "./DocsDiagram";

function plainText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(plainText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return plainText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

function headingId(children: React.ReactNode) {
  return plainText(children)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function internalHref(href: string, sourcePath: string) {
  if (href.startsWith("#")) return href;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  const [filePart, hash] = href.split("#", 2);
  if (!filePart) return href;

  const pathParts = sourcePath.split("/");
  pathParts.pop();
  for (const part of decodeURIComponent(filePart).replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") pathParts.pop();
    else pathParts.push(part);
  }
  const resolved = pathParts.join("/");
  const target = docBySourcePath.get(resolved);
  let destination = target ? docsHref(target.slug) : undefined;
  if (resolved === "project-notes/README.md") destination = "/docs";
  if (!destination) return href;
  return `${destination}${hash ? `#${hash}` : ""}`;
}

export function DocsMarkdown({ content, sourcePath }: { content: string; sourcePath: string }) {
  const usedHeadings = new Map<string, number>();
  const idFor = (children: React.ReactNode) => {
    const base = headingId(children);
    const count = usedHeadings.get(base) ?? 0;
    usedHeadings.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
  const components: Components = {
    a({ href = "", children }) {
      const destination = internalHref(href, sourcePath);
      if (/^(https?:|mailto:)/i.test(destination)) {
        return <a href={destination} target={destination.startsWith("http") ? "_blank" : undefined} rel={destination.startsWith("http") ? "noreferrer" : undefined}>{children}</a>;
      }
      return <Link href={destination}>{children}</Link>;
    },
    h1({ children }) { return <h1 id={idFor(children)}>{children}</h1>; },
    h2({ children }) { return <h2 id={idFor(children)}>{children}</h2>; },
    h3({ children }) { return <h3 id={idFor(children)}>{children}</h3>; },
    h4({ children }) { return <h4 id={idFor(children)}>{children}</h4>; },
    pre({ children }) { return <pre>{children}</pre>; },
    code({ className, children }) {
      if (className === "language-mermaid") {
        return <DocsDiagram chart={String(children).replace(/\n$/, "")} title="Mermaid diagram" />;
      }
      return <code className={className}>{children}</code>;
    },
  };

  return (
    <div className="docs-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}
