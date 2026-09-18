import { Canvas } from "@/components/canvas/Canvas";
import { SceneDebug } from "@/components/scene/SceneDebug";

export default function Home() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      <Canvas />
      <SceneDebug />
    </main>
  );
}
