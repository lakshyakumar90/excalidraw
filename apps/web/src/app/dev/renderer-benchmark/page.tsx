import { RendererBenchmark } from "@/components/canvas/RendererBenchmark";

export default function RendererBenchmarkPage() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="grid min-h-screen place-items-center">
        Renderer benchmark is available in development mode.
      </main>
    );
  }
  return <RendererBenchmark />;
}
