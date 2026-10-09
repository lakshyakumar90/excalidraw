"use client";

import type { SavedCanvasScene } from "@/lib/canvas/types";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { RoomRole } from "@repo/common";
import { shareScene } from "@/lib/api/rooms";
import { AccountLink } from "@/components/account/AccountLink";
import { EditorExtras } from "./EditorExtras";
import { LaserOverlay } from "@/components/presence/LaserOverlay";
import { Canvas } from "@/components/canvas/Canvas";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { StylePanel } from "@/components/styles/StylePanel";
import { Toolbar } from "@/components/toolbar/Toolbar";

export function CanvasWorkspace({
  savedScene,
  roomRole,
}: {
  savedScene?: SavedCanvasScene;
  roomRole?: RoomRole;
}) {
  const [activeRole, setActiveRole] = useState<RoomRole | undefined>(roomRole);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    setActiveRole(roomRole);
    setAccessRemoved(false);
  }, [roomRole]);
  useEffect(() => {
    const onAccessChanged = (event: Event) => {
      const role = (event as CustomEvent<{ role: RoomRole | null }>).detail
        .role;
      if (role === null) setAccessRemoved(true);
      else {
        setAccessRemoved(false);
        setActiveRole(role);
      }
    };
    window.addEventListener("room-access-changed", onAccessChanged);
    return () =>
      window.removeEventListener("room-access-changed", onAccessChanged);
  }, []);
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
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Could not share this scene",
      );
    } finally {
      setSharing(false);
    }
  }
  return (
    <main className="editor-workspace fixed inset-0 overflow-hidden bg-[#faf9f6]">
      <Canvas savedScene={savedScene} readOnly={readOnly} />
      <LaserOverlay />
      <EditorExtras readOnly={readOnly} roomId={savedScene?.roomSync?.roomId} />
      <div data-editor-chrome>
        <CanvasControls readOnly={readOnly} />
        {!readOnly && <Toolbar />}
        {!readOnly && <StylePanel />}
        <AccountLink />
      </div>
      {savedScene?.id && !savedScene.roomSync && (
        <div
          data-editor-chrome
          className="fixed left-4 top-4 z-50 max-w-[min(32rem,calc(100vw-7rem))] rounded-lg border border-neutral-200 bg-white/95 p-2 text-sm shadow-sm backdrop-blur"
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
      {savedScene?.roomSync && roomRole && (
        <div className="fixed left-4 top-4 z-40 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <span className="font-medium">
            {accessRemoved
              ? "Room access removed"
              : readOnly
                ? "View only"
                : activeRole}
          </span>
          {!accessRemoved && (
            <Link
              className="text-violet-700 underline"
              href={`/room/${savedScene.roomSync.roomId}`}
            >
              Room access
            </Link>
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
    </main>
  );
}
