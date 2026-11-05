"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

type Props = { chart: string; title: string };

const themeVariables = {
  light: {
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
  dark: {
    background: "#211f1b",
    primaryColor: "#302e28",
    primaryTextColor: "#f0eee9",
    primaryBorderColor: "#777267",
    lineColor: "#bbb5a8",
    secondaryColor: "#292720",
    tertiaryColor: "#24231f",
    textColor: "#f0eee9",
    mainBkg: "#302e28",
    nodeBorder: "#777267",
    actorBkg: "#302e28",
    actorBorder: "#777267",
    actorTextColor: "#f0eee9",
    actorLineColor: "#bbb5a8",
    signalColor: "#e3ded4",
    signalTextColor: "#f0eee9",
    labelBoxBkgColor: "#302e28",
    labelBoxBorderColor: "#777267",
    labelTextColor: "#f0eee9",
    loopTextColor: "#f0eee9",
    noteBkgColor: "#37342d",
    noteTextColor: "#f0eee9",
    noteBorderColor: "#777267",
    fontFamily: "Geist Mono, ui-monospace, monospace",
    fontSize: "13px",
  },
};

export function DocsDiagram({ chart, title }: Props) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const source = chart.trim();

  useEffect(() => {
    const root = document.querySelector(".docs-app");
    if (!root) return;
    const updateTheme = () => setIsDark(root.getAttribute("data-theme") === "dark");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let current = true;
    const id = `docs-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: isDark ? "dark" : "base",
      themeVariables: themeVariables[isDark ? "dark" : "light"],
    });
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
  }, [reactId, source, isDark]);

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
