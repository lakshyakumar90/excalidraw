import Link from "next/link";
import { docGroups, docsEntries, docsHref } from "@/lib/docsCatalog";

export const metadata = {
  title: "Project documentation",
  description: "Architecture, implementation walkthroughs, diagrams, and interview preparation for the collaborative drawing workspace.",
};

const featured = ["architecture", "features", "database", "improvement-proposals"];

export default function DocsHomePage() {
  const diagrams = docsEntries.filter((entry) => entry.kind === "diagram");
  const featuredDocs = featured.map((slug) => docsEntries.find((entry) => entry.slug === slug)).filter((entry) => entry !== undefined);

  return (
    <div className="docs-home">
      <div className="docs-home-breadcrumb"><span>Documentation</span><span aria-hidden="true">/</span><span>Project guide</span></div>
      <section className="docs-home-hero">
        <p className="docs-home-eyebrow"><span className="docs-status-dot" /> Repository guide</p>
        <h1>Understand the system<br />behind the canvas.</h1>
        <p className="docs-home-intro">A technical field guide to how this drawing workspace is built, how its pieces work together, and how to explain the trade-offs with confidence.</p>
        <div className="docs-home-actions">
          <Link href={docsHref("overview")} className="docs-primary-action">Read the overview <span aria-hidden="true">↗</span></Link>
          <Link href={docsHref("interview")} className="docs-secondary-action">Prepare for an interview</Link>
        </div>
      </section>

      <section className="docs-system-strip" aria-label="System flow">
        <div><span className="docs-flow-number">01</span><strong>Draw</strong><small>Canvas engine</small></div>
        <span className="docs-flow-line" aria-hidden="true" />
        <div><span className="docs-flow-number">02</span><strong>Collaborate</strong><small>HTTP + WebSocket</small></div>
        <span className="docs-flow-line" aria-hidden="true" />
        <div><span className="docs-flow-number">03</span><strong>Persist</strong><small>PostgreSQL + Redis</small></div>
      </section>

      <section className="docs-home-section">
        <div className="docs-section-heading"><div><p className="docs-section-kicker">A guided path</p><h2>Start with the important parts</h2></div><span>01—04</span></div>
        <div className="docs-feature-list">
          {featuredDocs.map((entry, index) => (
            <Link href={docsHref(entry.slug)} key={entry.slug} className="docs-feature-row">
              <span className="docs-feature-index">0{index + 1}</span>
              <span className="docs-feature-copy"><strong>{entry.title}</strong><small>{entry.description}</small></span>
              <span className="docs-feature-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="docs-home-section docs-diagram-section">
        <div className="docs-section-heading"><div><p className="docs-section-kicker">Visual reference</p><h2>Read the architecture as a map</h2></div><Link href={docsHref("diagrams/system-architecture")}>Open system map ↗</Link></div>
        <div className="docs-diagram-index">
          <div className="docs-diagram-index-mark" aria-hidden="true"><span /><span /><span /><i /><i /></div>
          <div><strong>{diagrams.length} diagrams</strong><p>System boundaries, package ownership, data relationships, authentication, realtime, and deployment—each rendered with its Mermaid source close by.</p></div>
          <div className="docs-diagram-links">{diagrams.slice(0, 4).map((entry) => <Link key={entry.slug} href={docsHref(entry.slug)}>{entry.title}</Link>)}</div>
        </div>
      </section>

      <section className="docs-home-section docs-index-section">
        <div className="docs-section-heading"><div><p className="docs-section-kicker">Browse the guide</p><h2>All topics</h2></div><span>{docsEntries.filter((entry) => entry.kind !== "diagram").length} articles</span></div>
        <div className="docs-topic-grid">
          {docGroups.filter((group) => group !== "Start here").map((group) => {
            const entries = docsEntries.filter((entry) => entry.group === group && entry.kind !== "diagram");
            if (!entries.length) return null;
            return <section className="docs-topic-group" key={group}><h3>{group}</h3>{entries.map((entry) => <Link key={entry.slug} href={docsHref(entry.slug)}>{entry.title}<span aria-hidden="true">↗</span></Link>)}</section>;
          })}
        </div>
      </section>
      <footer className="docs-home-footer"><span>Built from the implementation in this repository.</span><Link href={docsHref("coverage")}>Review coverage and open questions</Link></footer>
    </div>
  );
}
