"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

type Props = { chart: string; title: string };

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#f0eee8",
    primaryTextColor: "#171717",
    primaryBorderColor: "#d9d5cc",
    lineColor: "#747067",
    secondaryColor: "#faf9f6",
    tertiaryColor: "#ffffff",
    fontFamily: "Geist Mono, ui-monospace, monospace",
    fontSize: "13px",
  },
});

export function DocsDiagram({ chart, title }: Props) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const source = chart.trim();

  useEffect(() => {
    let current = true;
    const id = `docs-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    void mermaid
      .render(id, source)
      .then(({ svg: rendered }) => {
        if (current) {
          setSvg(rendered);
          setError(false);
        }
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [reactId, source]);

  return (
    <section className="docs-diagram" aria-label={title}>
      {error ? (
        <p className="docs-diagram-error">This diagram could not be rendered. Its source is available below.</p>
      ) : (
        <div
          className="docs-diagram-canvas"
          role="img"
          aria-label={title}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      <details className="docs-diagram-source">
        <summary>View Mermaid source</summary>
        <pre><code>{source}</code></pre>
      </details>
    </section>
  );
}
