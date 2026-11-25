"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type CSSProperties } from "react";
import { authClient } from "@repo/auth/client";
import { ChitranBrand } from "@/components/brand/ChitranLogo";
import { AuthPanel } from "./AuthPanel";

function drawStyle(len: number, delayMs: number): CSSProperties {
  return {
    "--draw-len": len,
    animationDelay: `${delayMs}ms`,
  } as CSSProperties;
}

export function AuthPage({
  mode,
  returnTo,
}: {
  mode: "login" | "signup";
  returnTo: string;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session?.user.emailVerified) router.replace(returnTo);
  }, [returnTo, router, session?.user]);

  const switchHref =
    mode === "login"
      ? `/sign-up${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`
      : `/sign-in${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <main className="auth-grid-bg relative flex min-h-dvh flex-col overflow-hidden text-[var(--text-primary)]">
      {/* Animated Architectural Artboard Blueprint (draws on open) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 720"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none fixed inset-0 h-full w-full opacity-65"
      >
        <g stroke="var(--border-soft)" strokeWidth="1" fill="none">
          {/* Outer artboard frame */}
          <rect
            x="220"
            y="60"
            width="560"
            height="600"
            className="animate-draw-stroke"
            style={drawStyle(2320, 0)}
          />
          {/* Inner dashed safe-area frame */}
          <rect
            x="260"
            y="100"
            width="480"
            height="520"
            strokeDasharray="4 4"
            className="animate-fade-in"
            style={{ animationDelay: "250ms" }}
          />
          {/* Diagonal construction lines */}
          <line
            x1="220"
            y1="60"
            x2="780"
            y2="660"
            strokeOpacity="0.45"
            className="animate-draw-stroke"
            style={drawStyle(850, 150)}
          />
          <line
            x1="780"
            y1="60"
            x2="220"
            y2="660"
            strokeOpacity="0.45"
            className="animate-draw-stroke"
            style={drawStyle(850, 220)}
          />
          {/* Concentric & overlapping circles */}
          <circle
            cx="500"
            cy="360"
            r="240"
            strokeOpacity="0.85"
            className="animate-draw-stroke"
            style={drawStyle(1510, 220)}
          />
          <circle
            cx="500"
            cy="360"
            r="175"
            strokeOpacity="0.4"
            className="animate-draw-stroke"
            style={drawStyle(1100, 320)}
          />
          <circle
            cx="500"
            cy="360"
            r="110"
            strokeOpacity="0.45"
            className="animate-draw-stroke"
            style={drawStyle(700, 420)}
          />
          {/* Overlapping offset circles */}
          <circle
            cx="370"
            cy="240"
            r="120"
            strokeOpacity="0.35"
            className="animate-draw-stroke"
            style={drawStyle(760, 460)}
          />
          <circle
            cx="630"
            cy="480"
            r="120"
            strokeOpacity="0.35"
            className="animate-draw-stroke"
            style={drawStyle(760, 520)}
          />
          {/* Overlapping rounded squircle & rotated keylines */}
          <rect
            x="280"
            y="120"
            width="440"
            height="480"
            rx="64"
            strokeOpacity="0.45"
            className="animate-draw-stroke"
            style={drawStyle(1840, 350)}
          />
          <rect
            x="320"
            y="160"
            width="360"
            height="400"
            rx="32"
            strokeOpacity="0.35"
            className="animate-draw-stroke"
            style={drawStyle(1520, 480)}
          />
          <rect
            x="360"
            y="220"
            width="280"
            height="280"
            rx="16"
            transform="rotate(45 500 360)"
            strokeOpacity="0.28"
            className="animate-draw-stroke"
            style={drawStyle(1120, 560)}
          />
        </g>

        {/* Coordinate ticks & Chitran annotations */}
        <g
          fill="var(--text-muted)"
          fontFamily="var(--font-mono)"
          fontSize="10"
          opacity="0.7"
          className="animate-fade-in"
          style={{ animationDelay: "500ms" }}
        >
          <text x="224" y="48">24 × 24 artboard</text>
          <text x="315" y="48">4</text>
          <text x="410" y="48">8</text>
          <text x="496" y="48">12</text>
          <text x="588" y="48">16</text>
          <text x="682" y="48">20</text>
          <text x="200" y="165">4</text>
          <text x="200" y="265">8</text>
          <text x="195" y="365">12</text>
          <text x="195" y="465">16</text>
          <text x="195" y="565">20</text>
          <text x="272" y="116">2px stroke · hand-drawn</text>
          <text x="645" y="154">keyline · r64</text>
          <text x="790" y="210">1 unit = 1 px</text>
          <text x="284" y="612">realtime · crdt sync</text>
          <text x="625" y="612">ai · mcp ready</text>
          <text x="635" y="678">chitran · infinite canvas</text>
        </g>
      </svg>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <ChitranBrand />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={switchHref}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--bg-hover)]"
          >
            Open canvas
          </Link>
        </div>
      </header>

      {/* Centered glassmorphic card */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-12 pt-4">
        {session?.user.emailVerified ? (
          <div
            className="animate-pop-up w-full max-w-[400px] rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)]/85 p-6 text-center text-xs text-[var(--text-muted)] shadow-2xl backdrop-blur-xl"
            role="status"
          >
            Redirecting to your workspace…
          </div>
        ) : (
          <div className="animate-pop-up w-full max-w-[400px] [&_section]:bg-[var(--bg-elevated)]/85 [&_section]:backdrop-blur-xl [&_section]:border-[var(--border-soft)]">
            <AuthPanel mode={mode} returnTo={returnTo} />
          </div>
        )}
      </div>
    </main>
  );
}
