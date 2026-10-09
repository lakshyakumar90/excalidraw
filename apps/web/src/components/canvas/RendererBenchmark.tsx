"use client";

import { useRef, useState } from "react";
import type { Viewport } from "@repo/common";
import {
  createElementBitmapCache,
  createRendererStressScene,
  renderStatic,
} from "@repo/engine";

interface BenchmarkResult {
  label: string;
  elementCount: number;
  visible: number;
  coldMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
  panMedianMs: number;
  cacheBytes: number;
  cacheHits: number;
  cacheMisses: number;
  cacheEvictions: number;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
    ] ?? 0
  );
}

export function RendererBenchmark() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [error, setError] = useState("");
  const [environment, setEnvironment] = useState("");

  async function run() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    setRunning(true);
    setError("");
    setResults([]);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    setEnvironment(
      `${navigator.userAgent} · cores ${navigator.hardwareConcurrency || "unknown"} · DPR ${pixelRatio} · ${width}×${height}`,
    );

    const viewport: Viewport = { scrollX: 0, scrollY: 0, zoom: 1 };
    const measure = (
      label: string,
      count: number,
      columns: number,
    ): BenchmarkResult => {
      const elements = createRendererStressScene(count, 0x18_05_2026, columns);
      const cache = createElementBitmapCache(64 * 1024 * 1024);
      const render = (scrollX = viewport.scrollX) =>
        renderStatic(
          { context, width, height, viewport: { ...viewport, scrollX } },
          elements,
          {
            background: true,
            grid: false,
            origin: false,
            bitmapCache: cache,
            pixelRatio,
          },
        );

      const coldStart = performance.now();
      const visible = render();
      const coldMs = performance.now() - coldStart;
      // One warm-up then ten measured redraws; pan samples retain geometry/cache keys.
      render();
      const warm: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const start = performance.now();
        render();
        warm.push(performance.now() - start);
      }
      const pan: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const start = performance.now();
        render(-((i % 3) + 1) * 8);
        pan.push(performance.now() - start);
      }
      const stats = cache.stats();
      cache.clear();
      return {
        label,
        elementCount: count,
        visible,
        coldMs,
        warmMedianMs: percentile(warm, 0.5),
        warmP95Ms: percentile(warm, 0.95),
        panMedianMs: percentile(pan, 0.5),
        cacheBytes: stats.bytes,
        cacheHits: stats.hits,
        cacheMisses: stats.misses,
        cacheEvictions: stats.evictions,
      };
    };

    try {
      // First case isolates a typical visible viewport; second stresses all 5,000.
      const typical = measure("500 visible elements", 500, 25);
      const stress = measure("5,000 element scene", 5_000, 100);
      setResults([typical, stress]);
      canvas.dataset.benchmarkReady = "true";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Benchmark failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="fixed inset-0 bg-[#faf9f6]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <section className="absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] max-w-[min(58rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <h1 className="text-lg font-semibold">Renderer benchmark</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Deterministic in-memory scenes. This does not change or save your
          canvas.
        </p>
        <button
          type="button"
          disabled={running}
          onClick={() => void run()}
          className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {running ? "Rendering scenes…" : "Run 500 / 5,000 element benchmark"}
        </button>
        {environment && (
          <p className="mt-3 break-all text-xs text-neutral-500">
            {environment}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {results.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr>
                  {[
                    "Scene",
                    "Visible",
                    "Cold ms",
                    "Warm median",
                    "Warm p95",
                    "Pan median",
                    "Cache MiB",
                    "Hits / misses / evictions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border-b px-2 py-1 font-semibold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.label}>
                    <td className="border-b px-2 py-1">{result.label}</td>
                    <td className="border-b px-2 py-1">
                      {result.visible}/{result.elementCount}
                    </td>
                    <td className="border-b px-2 py-1">
                      {result.coldMs.toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1">
                      {result.warmMedianMs.toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1">
                      {result.warmP95Ms.toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1">
                      {result.panMedianMs.toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1">
                      {(result.cacheBytes / 1_048_576).toFixed(1)}
                    </td>
                    <td className="border-b px-2 py-1">
                      {result.cacheHits} / {result.cacheMisses} /{" "}
                      {result.cacheEvictions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-neutral-500">
          Use a production build only for production performance comparisons.
          Warm timing includes canvas clear and redraw; cold timing includes
          bitmap creation. A value above 16.7ms exceeds a 60Hz frame budget.
        </p>
      </section>
    </main>
  );
}
