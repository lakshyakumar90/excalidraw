import { DocsShell } from "@/components/docs/DocsShell";
import { getDocsSearchIndex } from "@/lib/docsContent";
import "./docs.css";

// Applied before hydration so the docs theme/font never flash on load.
const DOCS_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('excalidraw-docs-theme');
    if (theme !== 'dark' && theme !== 'light') {
      theme = localStorage.getItem('excalidraw:theme') === 'light' ? 'light' : 'dark';
    }
    document.documentElement.dataset.docsTheme = theme;
    var font = localStorage.getItem('excalidraw-docs-font');
    document.documentElement.dataset.docsFont = font === 'mono' ? 'mono' : 'sans';
  } catch (e) {
    document.documentElement.dataset.docsTheme = 'dark';
    document.documentElement.dataset.docsFont = 'sans';
  }
})();
`;

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const searchIndex = await getDocsSearchIndex();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DOCS_INIT_SCRIPT }} />
      <DocsShell searchIndex={searchIndex}>{children}</DocsShell>
    </>
  );
}
