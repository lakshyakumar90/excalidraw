import { Canvas } from "@/components/canvas/Canvas";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { StylePanel } from "@/components/styles/StylePanel";


export default function Home() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#faf9f6]">
      <Canvas />
      <CanvasControls />
      <Toolbar />
      <StylePanel />
    </main>
  );
}
