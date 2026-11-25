"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardPresetId, Element } from "@repo/common";
import {
  mermaidToCanvasElements,
  TimedPlaybackQueue,
  type PlaybackStatus,
} from "@repo/engine";
import { apiUrl } from "@/lib/api/client";

type AiProviderId =
  | "openai-compatible"
  | "anthropic"
  | "gemini"
  | "opencode"
  | "codex-cli"
  | "antigravity-cli";

const PROVIDER_CARDS: Array<{
  id: AiProviderId;
  title: string;
  subtitle: string;
  keyPlaceholder?: string;
  keyHelpUrl?: string;
  defaultModel?: string;
}> = [
  {
    id: "anthropic",
    title: "Anthropic",
    subtitle: "Claude · recommended",
    keyPlaceholder: "sk-ant-...",
    keyHelpUrl: "console.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "openai-compatible",
    title: "OpenAI-compatible",
    subtitle: "OpenAI, OpenRouter, Ollama, LM Studio…",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "platform.openai.com",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "gemini",
    title: "Google Gemini",
    subtitle: "Gemini models",
    keyPlaceholder: "AIza...",
    keyHelpUrl: "aistudio.google.com",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "opencode",
    title: "OpenCode CLI",
    subtitle: "Runs local `opencode run`",
  },
  {
    id: "codex-cli",
    title: "Codex CLI",
    subtitle: "Runs local `codex exec`",
  },
  {
    id: "antigravity-cli",
    title: "AntiGravity CLI",
    subtitle: "Runs local `agy -p`",
  },
];

const QUICK_TEMPLATES = [
  { label: "Draw the architecture of a URL shortener", prompt: "Draw the architecture of a URL shortener" },
  { label: "Redis write-behind architecture", prompt: "Draw a Redis write-behind architecture" },
  { label: "Production RAG pipeline", prompt: "Draw a production RAG pipeline with hybrid retrieval and reranker" },
  { label: "OAuth + WebSocket auth flow", prompt: "Draw an OAuth + Better Auth session and WebSocket ticket flow" },
  { label: "Clean up my sketch", prompt: "Draw the Excalidraw collaborative whiteboard database ER schema" },
];

const BYOK_STORAGE_KEY = "excalidraw:ai-byok-config";

interface ByokConfig {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  remember: boolean;
}

interface StepProgressItem {
  title: string;
  detail?: string;
  artifact?: string;
  status: "pending" | "active" | "done";
  durationSec?: number;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  summary?: string;
  steps?: StepProgressItem[];
  status?: "generating" | "playing" | "done" | "stopped" | "error";
  error?: string;
  elapsedSec?: number;
}

const CHAT_STORAGE_PREFIX = "chitran:ai-chat:";

function chatStorageKey(roomId?: string): string {
  return `${CHAT_STORAGE_PREFIX}${roomId || "scratch"}`;
}

function readStoredChatTurns(roomId?: string): ChatTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(chatStorageKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatTurn[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-30).map((turn) =>
      turn.role === "assistant" &&
      (turn.status === "generating" || turn.status === "playing")
        ? { ...turn, status: "stopped" }
        : turn,
    );
  } catch {
    return [];
  }
}

function saveStoredChatTurns(roomId: string | undefined, turns: ChatTurn[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      chatStorageKey(roomId),
      JSON.stringify(turns.slice(-30)),
    );
  } catch {
    // Ignore storage quota errors.
  }
}

export interface AiCommandPaletteProps {
  open: boolean;
  roomId?: string;
  presetId?: BoardPresetId;
  onClose: () => void;
  onRevealElements: (elements: Element[], stepTitle: string) => void;
}

const DEFAULT_CONFIG: ByokConfig = {
  provider: "opencode",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  remember: false,
};

function readStoredByokConfig(): ByokConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const saved = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Omit<Partial<ByokConfig>, "provider"> & {
        provider?: string;
      };
      const provider =
        parsed.provider && parsed.provider !== "template"
          ? (parsed.provider as AiProviderId)
          : DEFAULT_CONFIG.provider;
      return { ...DEFAULT_CONFIG, ...parsed, provider };
    }
  } catch {
    // Ignore malformed stored settings.
  }
  return DEFAULT_CONFIG;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function nowMs(): number {
  return Date.now();
}

function getElementsMaxY(elements: readonly Element[], fallbackY: number): number {
  let maxY = fallbackY;
  for (const el of elements) {
    const minY = el.y + Math.min(0, el.height ?? 0);
    const boxBottom = minY + Math.abs(el.height ?? 0);
    if (boxBottom > maxY) maxY = boxBottom;
    if ("points" in el && Array.isArray(el.points)) {
      for (const pt of el.points) {
        const dy = Array.isArray(pt) ? Number(pt[1] ?? 0) : pt.y;
        const py = el.y + dy;
        if (py > maxY) maxY = py;
      }
    }
  }
  return maxY;
}

export function AiCommandPalette({
  open,
  roomId,
  presetId = "excali-font",
  onClose,
  onRevealElements,
}: AiCommandPaletteProps) {
  const [prompt, setPrompt] = useState("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>(() =>
    readStoredChatTurns(roomId),
  );
  const [config, setConfig] = useState<ByokConfig>(readStoredByokConfig);
  const [connectOpen, setConnectOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const queueRef = useRef<TimedPlaybackQueue | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const stepStartRef = useRef<number>(0);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveStoredChatTurns(roomId, chatTurns);
  }, [roomId, chatTurns]);

  useEffect(() => {
    if (!open) return;
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, chatTurns.length]);

  useEffect(() => {
    if (!loading && playbackStatus !== "playing") return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading, playbackStatus]);

  function updateConfig(patch: Partial<ByokConfig>) {
    if (patch.provider !== undefined) {
      setTestResult(null);
    }
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        if (next.remember) {
          window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(next));
        } else {
          window.localStorage.removeItem(BYOK_STORAGE_KEY);
        }
      } catch {
        // Ignore storage quota errors.
      }
      return next;
    });
  }

  function stopActiveRun() {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current?.cancel();
    queueRef.current = null;
    setLoading(false);
    setPlaybackStatus("idle");
    setChatTurns((prev) =>
      prev.map((turn) =>
        turn.role === "assistant" &&
        (turn.status === "generating" || turn.status === "playing")
          ? { ...turn, status: "stopped" }
          : turn,
      ),
    );
  }

  function handleStop() {
    stopActiveRun();
  }

  function handleNewChat() {
    stopActiveRun();
    setChatTurns([]);
    setPrompt("");
    setElapsedSec(0);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(chatStorageKey(roomId));
      } catch {
        // Ignore storage errors.
      }
    }
  }

  async function testConnection() {
    const isByok =
      config.provider === "anthropic" ||
      config.provider === "openai-compatible" ||
      config.provider === "gemini";
    if (isByok && !config.apiKey.trim()) {
      setTestResult({
        ok: false,
        message: `Enter an API key for ${activeProviderCard?.title ?? config.provider} first.`,
      });
      return;
    }

    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl("/api/ai/generate-diagram"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Draw a 2-node ping to pong health check diagram",
          provider: config.provider,
          apiKey: config.apiKey || undefined,
          baseUrl:
            config.provider === "openai-compatible" && config.baseUrl
              ? config.baseUrl
              : undefined,
          model: config.model || undefined,
          roomId,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Connection failed (${res.status})`);
      }
      const data = (await res.json()) as { mode?: string };
      setTestResult({
        ok: true,
        message:
          data.mode === "local-cli"
            ? `Connected via local ${activeProviderCard?.title ?? config.provider}`
            : `Connected (${activeProviderCard?.title ?? config.provider})`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTestingConn(false);
    }
  }

  async function runGeneration(inputPrompt?: string) {
    const finalPrompt = (inputPrompt ?? prompt).trim();
    if (!finalPrompt) return;

    // Stop any previous in-flight generation or playback while keeping earlier chat turns.
    stopActiveRun();
    const myReqId = ++requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const history = chatTurns
      .filter((t) => t.role === "user" || (t.role === "assistant" && t.status === "done"))
      .slice(-12)
      .map((t) => ({
        role: t.role,
        content: t.role === "assistant" ? (t.summary || t.content) : t.content,
      }));

    const turnBaseId = nowMs().toString(36);
    const userTurnId = `user-${turnBaseId}-${myReqId}`;
    const assistantTurnId = `assistant-${turnBaseId}-${myReqId}`;
    const initialPlanSteps: StepProgressItem[] = [
      {
        title: "Analyze prompt & architecture",
        detail: `Planning diagram via ${config.provider}`,
        artifact: "plan.json",
        status: "active",
      },
      { title: "Synthesize canvas elements", status: "pending" },
      { title: "Render step-by-step on board", status: "pending" },
    ];

    setPrompt("");
    setLoading(true);
    setElapsedSec(0);
    stepStartRef.current = nowMs();
    setChatTurns((prev) => [
      ...prev.map((turn) =>
        turn.role === "assistant" &&
        (turn.status === "generating" || turn.status === "playing")
          ? { ...turn, status: "stopped" as const }
          : turn,
      ),
      { id: userTurnId, role: "user", content: finalPrompt },
      {
        id: assistantTurnId,
        role: "assistant",
        content: finalPrompt,
        status: "generating",
        steps: initialPlanSteps,
      },
    ]);

    try {
      const res = await fetch(apiUrl("/api/ai/generate-diagram"), {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          provider: config.provider,
          apiKey: config.apiKey || undefined,
          baseUrl:
            config.provider === "openai-compatible" && config.baseUrl
              ? config.baseUrl
              : undefined,
          model: config.model || undefined,
          roomId,
          history,
        }),
      });

      if (controller.signal.aborted || myReqId !== requestIdRef.current) return;

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `AI generation failed (${res.status})`);
      }

      const data = (await res.json()) as {
        plan: {
          summary?: string;
          steps: ({ title: string; mermaidChunk: string } | { title: string; elements: Element[] })[];
        };
      };

      if (controller.signal.aborted || myReqId !== requestIdRef.current) return;

      const groupId = `ai-${nowMs().toString(36)}`;
      let nextOriginY = 80;
      const playbackSteps = data.plan.steps.map((step, idx) => {
        if ("elements" in step) {
          nextOriginY = getElementsMaxY(step.elements, nextOriginY) + 80;
          return step;
        }
        const { elements } = mermaidToCanvasElements(step.mermaidChunk, {
          presetId,
          diagramGroupId: `${groupId}-s${idx}`,
          originX: 80,
          originY: nextOriginY,
        });
        nextOriginY = getElementsMaxY(elements, nextOriginY) + 80;
        return { title: step.title, elements };
      });

      const initialSteps: StepProgressItem[] = playbackSteps.map((step, idx) => ({
        title: step.title,
        detail: `${step.elements.length} element${step.elements.length === 1 ? "" : "s"}`,
        artifact: `step-${idx + 1}.json`,
        status: idx === 0 ? "active" : "pending",
      }));

      setChatTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantTurnId
            ? {
                ...turn,
                summary: data.plan.summary || finalPrompt,
                steps: initialSteps,
                status: "playing",
              }
            : turn,
        ),
      );
      stepStartRef.current = nowMs();

      let revealIndex = 0;
      const queue = new TimedPlaybackQueue(playbackSteps, {
        stepDelayMs: 450,
        onRevealStep: (step) => {
          if (myReqId !== requestIdRef.current) return;
          const currentIdx = revealIndex++;
          const elapsedStep = Math.max(1, Math.round((Date.now() - stepStartRef.current) / 1000));
          stepStartRef.current = nowMs();
          setChatTurns((prev) =>
            prev.map((turn) => {
              if (turn.id !== assistantTurnId || !turn.steps) return turn;
              return {
                ...turn,
                steps: turn.steps.map((item, idx) => {
                  if (idx < currentIdx) return { ...item, status: "done" };
                  if (idx === currentIdx) return { ...item, status: "done", durationSec: elapsedStep };
                  if (idx === currentIdx + 1) return { ...item, status: "active" };
                  return item;
                }),
              };
            }),
          );
          onRevealElements(step.elements, step.title);
        },
        onStatusChange: (status) => {
          if (myReqId !== requestIdRef.current) return;
          setPlaybackStatus(status);
          if (status === "completed") {
            setChatTurns((prev) =>
              prev.map((turn) =>
                turn.id === assistantTurnId
                  ? {
                      ...turn,
                      status: "done",
                      steps: turn.steps?.map((item) => ({ ...item, status: "done" })),
                    }
                  : turn,
              ),
            );
          }
        },
      });
      queueRef.current = queue;
      queue.start();
    } catch (err) {
      if (controller.signal.aborted || myReqId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : "Could not generate diagram.";
      setChatTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantTurnId
            ? { ...turn, status: "error", error: message }
            : turn,
        ),
      );
    } finally {
      if (myReqId === requestIdRef.current) {
        setLoading(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    }
  }

  if (!open) return null;

  const activeProviderCard = PROVIDER_CARDS.find((p) => p.id === config.provider);

  return (
    <>
      {/* Right-side docked Assistant drawer */}
      <aside
        data-editor-chrome
        aria-label="Assistant"
        className="animate-drawer-right fixed bottom-0 right-0 top-0 z-50 flex w-[min(22.5rem,100vw)] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-primary)]">✦</span>
            <h2 className="text-sm font-semibold">Assistant</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {chatTurns.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                title="Start a new chat"
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                <span>+ New</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
            >
              <span>Connect AI</span>
              <span className="text-[10px] text-[var(--text-muted)]">⌄</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Assistant"
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {chatTurns.length === 0 ? (
            <>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Ask for a diagram, or follow up in chat to refine or expand your architecture.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      void runGeneration(tpl.prompt);
                    }}
                    className="cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-left text-xs text-[var(--text-primary)] transition hover:border-[var(--border-soft)] hover:bg-[var(--bg-hover)]"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            chatTurns.map((turn) => {
              if (turn.role === "user") {
                return (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)]">
                      {turn.content}
                    </div>
                  </div>
                );
              }

              const turnSteps = turn.steps ?? [];
              const doneCount = turnSteps.filter((s) => s.status === "done").length;
              const activeIdx = turnSteps.findIndex((s) => s.status === "active");
              const currentStepNumber =
                activeIdx >= 0 ? activeIdx + 1 : Math.max(1, doneCount);
              const isLive = turn.status === "generating" || turn.status === "playing";

              return (
                <div
                  key={turn.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {turn.summary || turn.content}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {turn.status === "stopped"
                          ? "Stopped"
                          : turn.status === "error"
                            ? "Failed"
                            : `AI · step ${currentStepNumber} of ${Math.max(1, turnSteps.length)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isLive && (
                        <>
                          <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                            {formatElapsed(elapsedSec)}
                          </span>
                          <button
                            type="button"
                            onClick={handleStop}
                            title="Stop generation"
                            aria-label="Stop generation"
                            className="grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          >
                            <span className="h-2 w-2 rounded-[2px] bg-current" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {turn.status === "error" && turn.error ? (
                    <div className="mt-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-400">
                      {turn.error}
                    </div>
                  ) : (
                    turnSteps.length > 0 && (
                      <>
                        <div className="mt-3 flex items-center gap-1">
                          {turnSteps.map((step, idx) => (
                            <div
                              key={`${step.title}-${idx}`}
                              className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border-subtle)]"
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  step.status === "done"
                                    ? "w-full bg-blue-500"
                                    : step.status === "active"
                                      ? "w-2/3 animate-pulse bg-blue-500"
                                      : "w-0"
                                }`}
                              />
                            </div>
                          ))}
                        </div>

                        <ul className="mt-3 space-y-2">
                          {turnSteps.map((step, idx) => {
                            const isLast = idx === turnSteps.length - 1;
                            return (
                              <li key={`${step.title}-${idx}`} className="relative">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                                      {!isLast && (
                                        <span
                                          aria-hidden="true"
                                          className={`absolute top-5 left-1/2 h-4 w-px -translate-x-1/2 ${
                                            step.status === "done"
                                              ? "bg-blue-500"
                                              : "bg-[var(--border-soft)]"
                                          }`}
                                        />
                                      )}
                                      {step.status === "done" ? (
                                        <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                                          ✓
                                        </span>
                                      ) : step.status === "active" ? (
                                        <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-blue-500 bg-blue-500/20">
                                          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-blue-400" />
                                        </span>
                                      ) : (
                                        <span className="h-4 w-4 rounded-full border border-[var(--border-soft)] bg-[var(--bg-canvas)]" />
                                      )}
                                    </div>
                                    <span
                                      className={`truncate text-xs ${
                                        step.status === "active"
                                          ? "font-semibold text-[var(--text-primary)]"
                                          : step.status === "done"
                                            ? "font-medium text-[var(--text-primary)]"
                                            : "text-[var(--text-muted)]"
                                      }`}
                                    >
                                      {step.title}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                                    {step.status === "active" && isLive && (
                                      <span className="font-medium text-blue-400">Drawing</span>
                                    )}
                                    {step.durationSec !== undefined && (
                                      <span className="font-mono tabular-nums text-[var(--text-muted)]">
                                        {step.durationSec}s
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>

                        {turn.status === "playing" &&
                          (playbackStatus === "playing" || playbackStatus === "paused") && (
                            <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--border-subtle)] pt-2.5 text-xs">
                              {playbackStatus === "playing" ? (
                                <button
                                  type="button"
                                  onClick={() => queueRef.current?.pause()}
                                  className="cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => queueRef.current?.resume()}
                                  className="cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                >
                                  Resume
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => queueRef.current?.skipToEnd()}
                                className="cursor-pointer rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
                              >
                                Skip to End
                              </button>
                            </div>
                          )}
                      </>
                    )
                  )}
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Bottom Prompt Composer */}
        <div className="border-t border-[var(--border-subtle)] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runGeneration();
            }}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3"
          >
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runGeneration();
                }
              }}
              placeholder={
                chatTurns.length > 0
                  ? "Follow up, refine, or send a new prompt..."
                  : "Ask, or select a diagram to edit it..."
              }
              className="w-full resize-none bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-[var(--text-muted)]">
                Using {activeProviderCard?.title ?? config.provider}
              </span>
              <button
                type="submit"
                disabled={!prompt.trim()}
                aria-label="Send prompt"
                className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)] disabled:cursor-default disabled:opacity-40"
              >
                ↗
              </button>
            </div>
          </form>
        </div>
      </aside>

      {/* Connect your AI Dialog (matches Image 10) */}
      {connectOpen && (
        <div
          data-editor-chrome
          className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={() => setConnectOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect your AI"
            className="animate-pop-up max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--text-primary)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">Connect your AI</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  Use your own API key or local coding CLI (OpenCode, Codex CLI, AntiGravity CLI). Keys stay in your browser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                aria-label="Close Connect AI dialog"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROVIDER_CARDS.map((card) => {
                const selected = config.provider === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() =>
                      updateConfig({
                        provider: card.id,
                        model: card.defaultModel ?? config.model,
                      })
                    }
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--bg-surface)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-soft)]"
                    }`}
                  >
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {card.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {card.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {(config.provider === "anthropic" ||
              config.provider === "openai-compatible" ||
              config.provider === "gemini") && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)]">
                    API key
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => updateConfig({ apiKey: e.target.value })}
                    placeholder={activeProviderCard?.keyPlaceholder ?? "sk-..."}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-soft)]"
                  />
                  {activeProviderCard?.keyHelpUrl && (
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Get one at <span className="underline">{activeProviderCard.keyHelpUrl}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-primary)]">
                    Model
                  </label>
                  <input
                    value={config.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder={activeProviderCard?.defaultModel ?? "Model name"}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-soft)]"
                  />
                </div>

                {config.provider === "openai-compatible" && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-primary)]">
                      Base URL
                    </label>
                    <input
                      value={config.baseUrl}
                      onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-soft)]"
                    />
                  </div>
                )}
              </div>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
              <input
                type="checkbox"
                checked={config.remember}
                onChange={(e) => updateConfig({ remember: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                <div className="font-semibold text-[var(--text-primary)]">
                  Remember on this device
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">Off:</strong> forgotten when you close the tab.
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">On:</strong> stored in this browser only.
                </div>
              </div>
            </label>

            {testResult && (
              <div
                role="status"
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                  testResult.ok
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/35 bg-rose-500/10 text-rose-400"
                }`}
              >
                {testResult.ok ? "✓ " : "✕ "}
                {testResult.message}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={testingConn}
                onClick={() => void testConnection()}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                {testingConn ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-fg)] transition hover:bg-[var(--accent-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
