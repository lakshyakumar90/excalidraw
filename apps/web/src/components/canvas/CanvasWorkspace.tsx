"use client";

import type { SavedCanvasScene } from "@/lib/canvas/types";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomRole } from "@repo/common";
import { shareScene } from "@/lib/api/rooms";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { EditorExtras } from "./EditorExtras";
import { LaserOverlay } from "@/components/presence/LaserOverlay";
import { Canvas } from "@/components/canvas/Canvas";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { SelectionActionBar } from "@/components/canvas/SelectionActionBar";
import { SandsOfTime } from "@/components/canvas/SandsOfTime";
import { Toolbar } from "@/components/toolbar/Toolbar";
import { useCanvasTheme } from "@/lib/theme";
import { FloatingCollabBar, type ActiveCollaborator, type SyncIndicatorState } from "./FloatingCollabBar";
import { applyBoardPresetToElements, getBoardPreset, isBoardPresetId, type BoardPresetId, type Element } from "@repo/common";
import { animateViewportTransition, computeSlideViewport, extractOrderedSlides, reorderSlides, type SlideDescriptor } from "@repo/engine";
import { historyStore } from "@/lib/history/historyStore";
import { scene } from "@/lib/scene/scene";
import { setTextFontFamily } from "@/lib/selection/textFont";
import { commitHistoryEntry } from "@/lib/sync/commits";
import { getCurrentViewport, setCurrentViewport } from "@/lib/persistence/viewportStore";
import { toolManager } from "@/lib/tools/toolManager";
import { styleStore } from "@/lib/styles/styleStore";
import { ConnectMcpModal } from "./ConnectMcpModal";
import { AiCommandPalette } from "./AiCommandPalette";
import { DiagramCodePane } from "./DiagramCodePane";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer";
import { SlidesFilmstrip } from "./SlidesFilmstrip";
import { PresentModeOverlay } from "./PresentModeOverlay";
import { ExportModal } from "./ExportModal";
import { PersonalLibraryPanel } from "./PersonalLibraryPanel";
import { selectionStore } from "@/lib/selection/selectionStore";
import { authClient } from "@repo/auth/client";

export function CanvasWorkspace({
  savedScene,
  roomRole,
}: {
  savedScene?: SavedCanvasScene;
  roomRole?: RoomRole;
}) {
  const router = useRouter();
  const { data: session, isPending: authPending } = authClient.useSession();
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
  const [, setSharing] = useState(false);
  const initialTheme = savedScene?.appState?.theme;
  const { theme, toggleTheme } = useCanvasTheme(
    initialTheme === "light" || initialTheme === "dark" ? initialTheme : undefined,
  );
  const initialPreset = savedScene?.appState?.boardPreset;
  const [boardPreset, setBoardPreset] = useState<BoardPresetId>(
    isBoardPresetId(initialPreset) ? initialPreset : "sketch",
  );
  const [presence, setPresence] = useState<{
    participants: ActiveCollaborator[];
    following: string | null;
    syncState: SyncIndicatorState;
  } | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<
    "ai" | "slides" | "code" | "history" | "library" | null
  >(null);
  const aiOpen = activeDrawer === "ai";
  const codeOpen = activeDrawer === "code";
  const historyOpen = activeDrawer === "history";
  const slidesOpen = activeDrawer === "slides";
  const libraryOpen = activeDrawer === "library";
  const [sandsOpen, setSandsOpen] = useState(false);
  const [sandsCount, setSandsCount] = useState(0);
  const toggleDrawer = (
    name: "ai" | "slides" | "code" | "history" | "library",
  ) => {
    setSandsOpen(false);
    setActiveDrawer((curr) => (curr === name ? null : name));
  };
  const [presentMode, setPresentMode] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [laserActive, setLaserActive] = useState(false);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [gridOverride, setGridOverride] = useState<boolean | null>(null);
  const gridEnabled = gridOverride ?? getBoardPreset(boardPreset).dotGrid;
  const cancelCamera = useRef<(() => void) | null>(null);
  useSyncExternalStore(scene.subscribe, scene.getSnapshot, () => 0);
  const slides = extractOrderedSlides(scene.getElements());
  const slideCount = slides.length;

  useEffect(() => () => cancelCamera.current?.(), []);

  useEffect(() => {
    const onPresenceStatus = (event: Event) =>
      setPresence((event as CustomEvent<NonNullable<typeof presence>>).detail);
    window.addEventListener("room-presence-status", onPresenceStatus);
    return () => window.removeEventListener("room-presence-status", onPresenceStatus);
  }, []);

  useEffect(() => {
    const onOpenMcp = () => setMcpOpen(true);
    const onOpenExport = () => setExportOpen(true);
    const onOpenAi = () => {
      setSandsOpen(false);
      setActiveDrawer("ai");
    };
    const onToggleCode = () => toggleDrawer("code");
    const onToggleHistory = () => toggleDrawer("history");
    const onToggleSlides = () => toggleDrawer("slides");
    const onOpenLibrary = () => toggleDrawer("library");
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleDrawer("ai");
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (slideCount > 0) {
          setPresentIndex(0);
          setPresentMode((v) => !v);
        }
      }
    };
    window.addEventListener("open-mcp-modal", onOpenMcp);
    window.addEventListener("open-export-modal", onOpenExport);
    window.addEventListener("open-ai-palette", onOpenAi);
    window.addEventListener("toggle-diagram-code", onToggleCode);
    window.addEventListener("toggle-version-history", onToggleHistory);
    window.addEventListener("toggle-slides-panel", onToggleSlides);
    window.addEventListener("editor-open-library", onOpenLibrary);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("open-mcp-modal", onOpenMcp);
      window.removeEventListener("open-export-modal", onOpenExport);
      window.removeEventListener("open-ai-palette", onOpenAi);
      window.removeEventListener("toggle-diagram-code", onToggleCode);
      window.removeEventListener("toggle-version-history", onToggleHistory);
      window.removeEventListener("toggle-slides-panel", onToggleSlides);
      window.removeEventListener("editor-open-library", onOpenLibrary);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [slideCount]);
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
  const slide = slides[Math.min(presentIndex, Math.max(0, slides.length - 1))];
  const slideX = slide?.x;
  const slideY = slide?.y;
  const slideWidth = slide?.width;
  const slideHeight = slide?.height;
  useEffect(() => {
    if (!presentMode || slideX === undefined || slideY === undefined ||
        slideWidth === undefined || slideHeight === undefined) return;
    const next = computeSlideViewport(
      { x: slideX, y: slideY, width: slideWidth, height: slideHeight },
      window.innerWidth, window.innerHeight,
    );
    return animateViewportTransition(getCurrentViewport(), next,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420,
      setCurrentViewport);
  }, [presentMode, slideX, slideY, slideWidth, slideHeight]);

  useEffect(() => {
    const preset = getBoardPreset(boardPreset);
    styleStore.set("strokeColor", preset.defaultStrokeColor);
    styleStore.set("backgroundColor", preset.defaultBackgroundColor);
    styleStore.set("strokeWidth", preset.strokeWidth);
    styleStore.set("roughness", preset.roughness);
  }, [boardPreset]);

  function commit(update: () => void) {
    if (readOnly) return;
    const { changes } = historyStore.commitUpdate(update);
    commitHistoryEntry(changes, "local");
  }

  function insertElements(elements: Element[], mode: "insert" | "replace", groupId?: string) {
    if (elements.length === 0) return;
    const previous = mode === "replace"
      ? scene.getElements().filter((item) => !item.isDeleted && item.groupIds?.includes(groupId ?? ""))
      : [];
    const viewport = getCurrentViewport();
    const minX = Math.min(...elements.map((item) => item.x));
    const minY = Math.min(...elements.map((item) => item.y));
    const x = previous.length ? Math.min(...previous.map((item) => item.x)) : (140 - viewport.scrollX) / viewport.zoom;
    const y = previous.length ? Math.min(...previous.map((item) => item.y)) : (140 - viewport.scrollY) / viewport.zoom;
    const nextIds = new Set(elements.map((item) => item.id));
    commit(() => {
      for (const item of previous) if (!nextIds.has(item.id)) scene.removeElement(item.id);
      for (const item of elements) {
        const next = { ...item, x: item.x + x - minX, y: item.y + y - minY, isDeleted: false };
        if (scene.getElement(item.id)) scene.mutateElement(item.id, next);
        else scene.addElement(next);
      }
    });
  }

  function selectSlide(selected: SlideDescriptor) {
    setActiveSlideId(selected.id);
    cancelCamera.current?.();
    cancelCamera.current = animateViewportTransition(
      getCurrentViewport(),
      computeSlideViewport(selected, window.innerWidth, window.innerHeight),
      300,
      setCurrentViewport,
    );
  }
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
  void session;
  void authPending;
  return (
    <main className={`editor-workspace fixed inset-0 overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] ${presentMode ? "editor-zen" : ""}`}>
      <Canvas savedScene={savedScene} theme={theme} presetId={boardPreset} gridEnabled={gridEnabled && !presentMode} readOnly={readOnly || (presentMode && !laserActive)} />
      <LaserOverlay />
      <EditorExtras readOnly={readOnly} roomId={savedScene?.roomSync?.roomId} />
      <div data-editor-chrome hidden={presentMode}>
        <Toolbar />
        <CanvasControls readOnly={readOnly} gridEnabled={gridEnabled} onToggleGrid={() => setGridOverride(!gridEnabled)} />
        <SelectionActionBar
          readOnly={readOnly}
          onOpenAiClean={() => {
            setSandsOpen(false);
            setActiveDrawer("ai");
          }}
        />
        <FloatingCollabBar
          theme={theme}
          onToggleTheme={toggleTheme}
          collaborators={presence?.participants}
          syncState={presence?.syncState ?? (savedScene?.roomSync ? "syncing" : "saved")}
          followingConnectionId={presence?.following}
          onToggleFollow={(connId) =>
            window.dispatchEvent(new CustomEvent("room-follow-toggle", { detail: connId }))
          }
          onOpenShare={savedScene?.id && !savedScene.roomSync ? () => void shareCurrentScene() : undefined}
          onOpenAiPalette={() => toggleDrawer("ai")}
          onOpenSands={() => {
            setActiveDrawer(null);
            setSandsOpen((v) => !v);
          }}
          sandsOpen={sandsOpen}
          sandsCount={sandsCount}
          onOpenDiagramCode={() => toggleDrawer("code")}
          onOpenSlides={() => toggleDrawer("slides")}
          onOpenHistory={() => toggleDrawer("history")}
          onOpenMcp={() => window.dispatchEvent(new CustomEvent("open-mcp-modal"))}
          aiOpen={aiOpen}
          slidesOpen={slidesOpen}
          codeOpen={codeOpen}
          historyOpen={historyOpen}
          libraryOpen={libraryOpen}
          roomId={savedScene?.roomSync?.roomId}
        />
        <SandsOfTime
          open={sandsOpen}
          onClose={() => setSandsOpen(false)}
          onCountChange={setSandsCount}
          drawerOffsetClass={activeDrawer ? "right-[min(26.5rem,calc(100vw-3rem))]" : "right-14"}
        />
        <EditorHeader
          sceneTitle={savedScene?.title || undefined}
          backHref={
            savedScene?.roomSync
              ? `/room/${savedScene.roomSync.roomId}`
              : "/dashboard"
          }
          showAccount={!savedScene?.roomSync}
          boardPreset={boardPreset}
          theme={theme}
          onToggleTheme={toggleTheme}
          onChangePreset={(next, restyle) => {
            setBoardPreset(next);
            if (restyle) commit(() => {
              const elements = scene.getElements().filter((item) => !item.isDeleted && item.type !== "image");
              for (const item of applyBoardPresetToElements(elements, next)) scene.mutateElement(item.id, item);
              setTextFontFamily(elements, getBoardPreset(next).fontFamily);
            });
          }}
          syncLabel={
            presence?.syncState === "syncing"
              ? "Syncing…"
              : presence?.syncState === "offline"
                ? "Offline"
                : savedScene?.roomSync
                  ? "Synced"
                  : "Saved on this device"
          }
          onShare={savedScene?.id && !savedScene.roomSync ? () => void shareCurrentScene() : undefined}
        />
      </div>
      {(shareUrl || shareError) && (
        <div
          data-editor-chrome
          role={shareError ? "alert" : "status"}
          className="animate-pop-up fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3.5 py-2 text-xs text-[var(--text-primary)] shadow-2xl backdrop-blur-md"
        >
          {shareUrl ? (
            <span>
              Room link:{" "}
              <Link className="font-medium text-[var(--text-primary)] underline" href={shareUrl}>
                {shareUrl}
              </Link>
            </span>
          ) : (
            <span className="text-rose-400">{shareError}</span>
          )}
          <button
            type="button"
            onClick={() => {
              setShareUrl("");
              setShareError("");
            }}
            aria-label="Dismiss"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ✕
          </button>
        </div>
      )}
      {accessRemoved && (
        <div
          role="alert"
          className="fixed inset-x-0 top-14 z-[80] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-xl border border-rose-500/40 bg-[var(--bg-elevated)] px-4 py-2.5 text-xs text-rose-300 shadow-xl"
        >
          Your room access was removed. Pending edits remain on this device.{" "}
          <Link className="ml-2 font-medium text-[var(--text-primary)] underline" href="/dashboard">
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
        onClose={() => setActiveDrawer(null)}
        onRevealElements={(elements) => {
          if (readOnly) return;
          window.dispatchEvent(new CustomEvent("canvas-reveal", { detail: elements.map(({ id }) => id) }));
          commit(() => {
            for (const element of elements) scene.addElement(element);
          });
        }}
      />
      <DiagramCodePane
        open={codeOpen}
        presetId={boardPreset}
        onClose={() => setActiveDrawer(null)}
        onApplyElements={insertElements}
      />
      <VersionHistoryDrawer
        open={historyOpen}
        sceneId={savedScene?.id}
        canRestore={!savedScene?.roomSync || activeRole === "owner"}
        onClose={() => setActiveDrawer(null)}
        onRestored={() => window.location.reload()}
      />
      <SlidesFilmstrip
        open={slidesOpen && !presentMode}
        slides={slides}
        activeSlideId={activeSlideId}
        onSelectSlide={selectSlide}
        onReorder={(ids) => commit(() => {
          for (const frame of reorderSlides(scene.getElements(), ids))
            scene.mutateElement(frame.id, { slideOrder: frame.slideOrder });
        })}
        onAddSlide={readOnly ? undefined : () => commit(() => {
          const viewport = getCurrentViewport();
          scene.addElement({
            id: crypto.randomUUID(),
            type: "frame",
            x: (160 - viewport.scrollX) / viewport.zoom,
            y: (120 - viewport.scrollY) / viewport.zoom,
            width: 960,
            height: 540,
            title: `Slide ${slides.length + 1}`,
            slideOrder: Math.max(-1, ...slides.map((item) => item.slideOrder)) + 1,
          });
        })}
        onStartPresent={() => {
          setPresentIndex(0);
          setPresentMode(true);
        }}
        onClose={() => setActiveDrawer(null)}
      />
      {libraryOpen && (
        <aside
          data-editor-chrome
          aria-label="Library"
          className="animate-drawer-right fixed bottom-0 right-0 top-0 z-50 flex w-[min(22.5rem,100vw)] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <h2 className="text-sm font-semibold">Your library</h2>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              aria-label="Close Library"
              className="grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <PersonalLibraryPanel
              readOnly={readOnly}
              roomId={savedScene?.roomSync?.roomId}
              selectionCount={selectionStore.getSnapshot().size}
            />
          </div>
        </aside>
      )}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        defaultDark={theme === "dark"}
        slidesCount={slides.length}
      />
      <PresentModeOverlay
        active={presentMode}
        slides={slides}
        currentIndex={Math.min(presentIndex, Math.max(0, slides.length - 1))}
        laserActive={laserActive}
        onNavigate={setPresentIndex}
        onToggleLaser={() => {
          toolManager.setActiveTool(laserActive ? "selection" : "laser");
          setLaserActive(!laserActive);
        }}
        onExit={() => {
          if (laserActive) toolManager.setActiveTool("selection");
          setLaserActive(false);
          setPresentMode(false);
        }}
      />
    </main>
  );
}
