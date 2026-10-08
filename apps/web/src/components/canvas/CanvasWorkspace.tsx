import type { SavedCanvasScene } from "@/lib/canvas/types";
import { AccountLink } from "@/components/account/AccountLink";
import { Canvas } from "@/components/canvas/Canvas";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { StylePanel } from "@/components/styles/StylePanel";
import { Toolbar } from "@/components/toolbar/Toolbar";

export function CanvasWorkspace({
  savedScene,
}: {
  savedScene?: SavedCanvasScene;
}) {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#faf9f6]">
      <Canvas savedScene={savedScene} />
      <CanvasControls />
      <Toolbar />
      <StylePanel />
      <AccountLink />
    </main>
  );
}
