import { Canvas } from "@/components/canvas/Canvas";
import { CanvasDiagnostics } from "@/components/canvas/CanvasDiagnostics";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { StylePanel } from "@/components/styles/StylePanel";


export default function Home() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      <Canvas />
      <CanvasDiagnostics />
      <Toolbar />
      <StylePanel />
    </main>
  );
}
