import Link from "next/link";
import type { BoardPresetId } from "@repo/common";
import type { CanvasTheme } from "@repo/engine";
import { AccountLink } from "@/components/account/AccountLink";
import { FileMenu } from "@/components/toolbar/FileMenu";
import { BoardPresetSwitcher } from "@/components/toolbar/BoardPresetSwitcher";
import { ChitranMark } from "@/components/brand/ChitranLogo";

export function EditorHeader({
  sceneTitle,
  backHref = "/dashboard",
  showAccount = true,
  boardPreset,
  onChangePreset,
  theme = "dark",
  onToggleTheme,
  syncLabel = "Saved on this device",
  onShare,
}: {
  sceneTitle?: string;
  backHref?: string;
  showAccount?: boolean;
  boardPreset?: BoardPresetId;
  onChangePreset?: (presetId: BoardPresetId, restyleExisting: boolean) => void;
  theme?: CanvasTheme;
  onToggleTheme?: () => void;
  syncLabel?: string;
  onShare?: () => void;
}) {
  return (
    <header className="editor-header fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {/* Top-left: Hamburger + Brand/Scene pill */}
      <div className="flex min-w-0 items-center gap-2">
        <FileMenu />
        <Link
          href={backHref}
          aria-label={sceneTitle ? `Chitran dashboard. Current scene: ${sceneTitle}` : "Chitran dashboard"}
          className="inline-flex h-9 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 text-xs text-[var(--text-primary)] shadow-xl backdrop-blur-md transition-all duration-200 hover:bg-[var(--bg-hover)]"
        >
          <ChitranMark className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]" />
          <span className="font-semibold tracking-tight">Chitran</span>
          <span className="h-3 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
          <span className="editor-header-scene-title truncate font-medium">
            {sceneTitle || "Scratch board"}
          </span>
          <span className="hidden items-center gap-1.5 text-[11px] text-[var(--text-muted)] md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{syncLabel}</span>
          </span>
        </Link>
      </div>

      {/* Top-right: Preset/Theme switcher + Export/Share + Account */}
      <div className="flex shrink-0 items-center gap-2">
        {boardPreset && onChangePreset && (
          <div className="hidden sm:block">
            <BoardPresetSwitcher
              value={boardPreset}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onChange={onChangePreset}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (onShare) onShare();
            else window.dispatchEvent(new CustomEvent("open-export-modal"));
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-fg)] shadow-xl transition-all duration-200 hover:bg-[var(--accent-hover)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
          </svg>
          <span>{onShare ? "Share" : "Export"}</span>
        </button>
        {showAccount && <AccountLink />}
      </div>
    </header>
  );
}
