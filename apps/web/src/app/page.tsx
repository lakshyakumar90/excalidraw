import { Canvas } from "@/components/canvas/Canvas";
import { CanvasDiagnostics } from "@/components/canvas/CanvasDiagnostics";
import { SceneDebug } from "@/components/scene/SceneDebug";
import { Toolbar } from "@/components/toolbar/Toolbar";


export default function Home() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      <Canvas />
      <SceneDebug />
      <CanvasDiagnostics />
      <Toolbar />
    </main>
  );
}
