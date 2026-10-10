import Link from "next/link";
import { AccountLink } from "@/components/account/AccountLink";
import { Toolbar } from "@/components/toolbar/Toolbar";

export function EditorHeader({ sceneTitle }: { sceneTitle?: string }) {
  return (
    <header className="editor-header fixed inset-x-0 top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="editor-header-left min-w-0">
        {sceneTitle ? (
          <Link
            href="/dashboard"
            aria-label={`Back to scenes. Current scene: ${sceneTitle}`}
            className="editor-header-back inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-neutral-700 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ←
            </span>
            <span className="editor-header-scene-title truncate">
              {sceneTitle}
            </span>
          </Link>
        ) : (
          <span className="sr-only">New drawing</span>
        )}
      </div>
      <div className="editor-header-tools min-w-0">
        <Toolbar />
      </div>
      <div className="editor-header-account flex min-w-0 justify-end">
        <AccountLink />
      </div>
    </header>
  );
}
