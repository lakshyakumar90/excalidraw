"use client";

import type { SavedCanvasScene } from "@/lib/canvas/types";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomRole } from "@repo/common";
import { shareScene } from "@/lib/api/rooms";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { EditorExtras } from "./EditorExtras";
import { LaserOverlay } from "@/components/presence/LaserOverlay";
import { Canvas } from "@/components/canvas/Canvas";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { StylePanel } from "@/components/styles/StylePanel";
import { useCanvasTheme } from "@/lib/theme";
import { FloatingCollabBar } from "./FloatingCollabBar";
import { BoardPresetSwitcher } from "@/components/toolbar/BoardPresetSwitcher";
import type { BoardPresetId } from "@repo/common";
import { ConnectMcpModal } from "./ConnectMcpModal";
import { AiCommandPalette } from "./AiCommandPalette";
import { DiagramCodePane } from "./DiagramCodePane";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer";
import { SlidesFilmstrip } from "./SlidesFilmstrip";
import { PresentModeOverlay } from "./PresentModeOverlay";

export function CanvasWorkspace({
  savedScene,
  roomRole,
}: {
  savedScene?: SavedCanvasScene;
  roomRole?: RoomRole;
}) {
  const router = useRouter();
  const [roleState, setRoleState] = useState(() => ({
    sourceRole: roomRole,
    activeRole: roomRole,
    accessRemoved: false,
  }));
  const roleStateMatchesProps = roleState.sourceRole === roomRole;
  const activeRole = roleStateMatchesProps ? roleState.activeRole : roomRole;
  const accessRemoved = roleStateMatchesProps && roleState.accessRemoved;
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const { theme, toggleTheme } = useCanvasTheme();
  const [boardPreset, setBoardPreset] = useState<BoardPresetId>("excali-font");
  const [followingConnectionId, setFollowingConnectionId] = useState<string | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [laserActive, setLaserActive] = useState(false);

  useEffect(() => {
    const onOpenMcp = () => setMcpOpen(true);
    const onOpenAi = () => setAiOpen(true);
    const onToggleCode = () => setCodeOpen((v) => !v);
    const onToggleHistory = () => setHistoryOpen((v) => !v);
    const onToggleSlides = () => setSlidesOpen((v) => !v);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPresentMode((v) => !v);
      }
    };
    window.addEventListener("open-mcp-modal", onOpenMcp);
    window.addEventListener("open-ai-palette", onOpenAi);
    window.addEventListener("toggle-diagram-code", onToggleCode);
    window.addEventListener("toggle-version-history", onToggleHistory);
    window.addEventListener("toggle-slides-panel", onToggleSlides);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("open-mcp-modal", onOpenMcp);
      window.removeEventListener("open-ai-palette", onOpenAi);
      window.removeEventListener("toggle-diagram-code", onToggleCode);
      window.removeEventListener("toggle-version-history", onToggleHistory);
      window.removeEventListener("toggle-slides-panel", onToggleSlides);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => {
    const onAccessChanged = (event: Event) => {
      const role = (event as CustomEvent<{ role: RoomRole | null }>).detail
        .role;
      setRoleState({
        sourceRole: roomRole,
        activeRole: role ?? undefined,
        accessRemoved: role === null,
      });
    };
    window.addEventListener("room-access-changed", onAccessChanged);
    return () =>
      window.removeEventListener("room-access-changed", onAccessChanged);
  }, [roomRole]);
  const readOnly = activeRole === "viewer" || accessRemoved;
  async function shareCurrentScene() {
    if (!savedScene?.id) return;
    setSharing(true);
    setShareError("");
    try {
      const result = await shareScene(
        savedScene.title?.trim() || "Shared scene",
        savedScene.id,
      );
      setShareUrl(result.url);
      router.replace(`/room/${encodeURIComponent(result.roomId)}/canvas`);
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Could not share this scene",
      );
    } finally {
      setSharing(false);
    }
  }
  return (
    <main className="editor-workspace fixed inset-0 overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <Canvas savedScene={savedScene} readOnly={readOnly} />
      <LaserOverlay />
      <EditorExtras readOnly={readOnly} roomId={savedScene?.roomSync?.roomId} />
      <div data-editor-chrome>
        <CanvasControls readOnly={readOnly} />
        <div className="fixed bottom-4 right-4 z-40 hidden md:block">
          <BoardPresetSwitcher
            value={boardPreset}
            onChange={(next) => {
              setBoardPreset(next);
              window.dispatchEvent(new CustomEvent("board-preset-changed", { detail: { presetId: next } }));
            }}
          />
        </div>
        <FloatingCollabBar
          theme={theme}
          onToggleTheme={toggleTheme}
          followingConnectionId={followingConnectionId}
          onToggleFollow={(connId) =>
            setFollowingConnectionId((cur) => (cur === connId ? null : connId))
          }
          onOpenShare={savedScene?.id && !savedScene.roomSync ? () => void shareCurrentScene() : undefined}
          onOpenAiPalette={() => window.dispatchEvent(new CustomEvent("open-ai-palette"))}
          onOpenDiagramCode={() => window.dispatchEvent(new CustomEvent("toggle-diagram-code"))}
          onOpenSlides={() => window.dispatchEvent(new CustomEvent("toggle-slides-panel"))}
          onOpenHistory={() => window.dispatchEvent(new CustomEvent("toggle-version-history"))}
          onOpenMcp={() => window.dispatchEvent(new CustomEvent("open-mcp-modal"))}
          roomId={savedScene?.roomSync?.roomId}
        />
        {!readOnly && <StylePanel />}
        <EditorHeader
          sceneTitle={savedScene?.title || undefined}
          backHref={
            savedScene?.roomSync
              ? `/room/${savedScene.roomSync.roomId}`
              : "/dashboard"
          }
          showAccount={!savedScene?.roomSync}
        />
      </div>
      {savedScene?.id && !savedScene.roomSync && (
        <div
          data-editor-chrome
          className="editor-scene-actions fixed left-4 top-4 z-50 max-w-[min(32rem,calc(100vw-7rem))] rounded-lg border border-neutral-200 bg-white/95 p-2 text-sm shadow-sm backdrop-blur"
        >
          <button
            type="button"
            disabled={sharing}
            onClick={() => void shareCurrentScene()}
            className="rounded-md bg-violet-600 px-3 py-2 font-semibold text-white disabled:opacity-60"
          >
            {sharing ? "Sharing…" : "Share scene"}
          </button>
          {shareUrl && (
            <p role="status" className="mt-2 break-all">
              Room link:{" "}
              <Link className="text-violet-700 underline" href={shareUrl}>
                {shareUrl}
              </Link>
            </p>
          )}
          {shareError && (
            <p role="alert" className="mt-2 text-red-700">
              {shareError}
            </p>
          )}
        </div>
      )}
      {accessRemoved && (
        <div
          role="alert"
          className="fixed inset-x-0 top-16 z-[80] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-red-800 shadow-lg"
        >
          Your room access was removed. Pending edits remain on this device.{" "}
          <Link className="ml-2 underline" href="/dashboard">
            Open dashboard
          </Link>
        </div>
      )}
      <ConnectMcpModal
        open={mcpOpen}
        roomId={savedScene?.roomSync?.roomId}
        sceneId={savedScene?.id}
        onClose={() => setMcpOpen(false)}
      />
      <AiCommandPalette
        open={aiOpen}
        roomId={savedScene?.roomSync?.roomId}
        presetId={boardPreset}
        onClose={() => setAiOpen(false)}
        onRevealElements={(els, title) => {
          window.dispatchEvent(
            new CustomEvent("ai-elements-revealed", { detail: { elements: els, title } }),
          );
        }}
      />
      <DiagramCodePane
        open={codeOpen}
        presetId={boardPreset}
        onClose={() => setCodeOpen(false)}
        onApplyElements={(els, mode, diagramGroupId) => {
          window.dispatchEvent(
            new CustomEvent("diagram-code-apply", {
              detail: { elements: els, mode, diagramGroupId },
            }),
          );
        }}
      />
      <VersionHistoryDrawer
        open={historyOpen}
        sceneId={savedScene?.id}
        onClose={() => setHistoryOpen(false)}
        onRestored={() => window.location.reload()}
      />
      <SlidesFilmstrip
        open={slidesOpen && !presentMode}
        slides={[]}
        activeSlideId={null}
        onSelectSlide={() => undefined}
        onReorder={() => undefined}
        onStartPresent={() => {
          setPresentIndex(0);
          setPresentMode(true);
        }}
        onClose={() => setSlidesOpen(false)}
      />
      <PresentModeOverlay
        active={presentMode}
        slides={[]}
        currentIndex={presentIndex}
        laserActive={laserActive}
        onNavigate={setPresentIndex}
        onToggleLaser={() => setLaserActive((v) => !v)}
        onExit={() => setPresentMode(false)}
      />
    </main>
  );
}
