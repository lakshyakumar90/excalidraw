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
  | "antigravity-cli"
  | "template";

const QUICK_TEMPLATES = [
  { label: "Redis Write-Behind", prompt: "Draw a Redis write-behind architecture" },
  { label: "RAG Pipeline", prompt: "Draw a production RAG pipeline with hybrid retrieval and reranker" },
  { label: "Auth Flow", prompt: "Draw an OAuth + Better Auth session and WebSocket ticket flow" },
  { label: "ER Diagram", prompt: "Draw the Excalidraw collaborative whiteboard database ER schema" },
];

const BYOK_STORAGE_KEY = "excalidraw:ai-byok-config";

interface ByokConfig {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiCommandPaletteProps {
  open: boolean;
  roomId?: string;
  presetId?: BoardPresetId;
  onClose: () => void;
  onRevealElements: (elements: Element[], stepTitle: string) => void;
}

export function AiCommandPalette({
  open,
  roomId,
  presetId = "excali-font",
  onClose,
  onRevealElements,
}: AiCommandPaletteProps) {
  const [prompt, setPrompt] = useState("");
  const [config, setConfig] = useState<ByokConfig>({
    provider: "template",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "",
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cliCommand, setCliCommand] = useState("");
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [activeStepTitle, setActiveStepTitle] = useState("");
  const queueRef = useRef<TimedPlaybackQueue | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(BYOK_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ByokConfig>;
        setConfig((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore malformed stored settings.
    }
  }, []);

  function updateConfig(patch: Partial<ByokConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors.
      }
      return next;
    });
  }

  async function runGeneration(inputPrompt?: string) {
    const finalPrompt = (inputPrompt ?? prompt).trim();
    if (!finalPrompt) return;
    setLoading(true);
    setError("");
    setCliCommand("");
    queueRef.current?.cancel();

    try {
      const res = await fetch(apiUrl("/api/ai/generate-diagram"), {
        method: "POST",
        credentials: "include",
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
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `AI generation failed (${res.status})`);
      }

      const data = (await res.json()) as {
        cliCommand?: string;
        plan: { steps: { title: string; mermaidChunk: string }[] };
      };
      if (data.cliCommand) setCliCommand(data.cliCommand);

      const groupId = `ai-${Date.now().toString(36)}`;
      const playbackSteps = data.plan.steps.map((step, idx) => {
        const { elements } = mermaidToCanvasElements(step.mermaidChunk, {
          presetId,
          diagramGroupId: `${groupId}-s${idx}`,
          originX: 80,
          originY: 80 + idx * 240,
        });
        return { title: step.title, elements };
      });

      const queue = new TimedPlaybackQueue(playbackSteps, {
        stepDelayMs: 450,
        onRevealStep: (step) => {
          setActiveStepTitle(step.title);
          onRevealElements(step.elements, step.title);
        },
        onStatusChange: (status) => setPlaybackStatus(status),
      });
      queueRef.current = queue;
      queue.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate diagram.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      data-editor-chrome
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-20 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl text-[var(--text-primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[var(--accent)]/20 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              AI ⌘K
            </span>
            <h2 className="text-sm font-semibold">Prompt-to-Diagram Studio</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showSettings ? "Hide Provider" : `Provider: ${config.provider}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Palette"
              className="rounded-lg px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Prompt input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runGeneration();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe an architecture (e.g., Draw a Redis write-behind architecture)…"
            autoFocus
            className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? "Drawing…" : "Draw"}
          </button>
        </form>

        {/* Quick architectural templates */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => {
                setPrompt(tpl.prompt);
                void runGeneration(tpl.prompt);
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              {tpl.label}
            </button>
          ))}
        </div>

        {/* BYOK & Local CLI settings */}
        {showSettings && (
          <div className="mt-4 space-y-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 text-xs">
            <div className="font-semibold text-[var(--text-primary)]">
              Bring Your Own Key (BYOK) or Local Coding CLI
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["template", "Built-in Templates"],
                  ["openai-compatible", "OpenAI-Compatible"],
                  ["anthropic", "Anthropic"],
                  ["gemini", "Gemini"],
                  ["opencode", "OpenCode CLI"],
                  ["codex-cli", "Codex CLI"],
                  ["antigravity-cli", "AntiGravity CLI"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateConfig({ provider: id })}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium ${
                    config.provider === id
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(config.provider === "openai-compatible" ||
              config.provider === "anthropic" ||
              config.provider === "gemini") && (
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => updateConfig({ apiKey: e.target.value })}
                  placeholder="API Key (stored locally in browser)"
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs outline-none"
                />
                <input
                  value={config.model}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  placeholder={
                    config.provider === "anthropic"
                      ? "Model (e.g. claude-3-5-sonnet-latest)"
                      : config.provider === "gemini"
                        ? "Model (e.g. gemini-2.5-flash)"
                        : "Model (e.g. gpt-4o-mini)"
                  }
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs outline-none"
                />
                {config.provider === "openai-compatible" && (
                  <input
                    value={config.baseUrl}
                    onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                    placeholder="Base URL (OpenAI, OpenRouter, Ollama, Groq…)"
                    className="sm:col-span-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs outline-none"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Local CLI copyable command */}
        {cliCommand && (
          <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-indigo-300">
              <span>Run in your local {config.provider} terminal (via MCP)</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(cliCommand)}
                className="rounded bg-indigo-500/20 px-2 py-0.5 hover:bg-indigo-500/30"
              >
                Copy
              </button>
            </div>
            <code className="block overflow-x-auto font-mono text-[11px] text-slate-200">
              {cliCommand}
            </code>
          </div>
        )}

        {/* Timed playback controls */}
        {(playbackStatus === "playing" || playbackStatus === "paused") && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
            <span className="truncate text-[var(--text-muted)]">
              Drawing: <strong className="text-[var(--text-primary)]">{activeStepTitle}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              {playbackStatus === "playing" ? (
                <button
                  type="button"
                  onClick={() => queueRef.current?.pause()}
                  className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => queueRef.current?.resume()}
                  className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1"
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={() => queueRef.current?.skipToEnd()}
                className="rounded-lg bg-[var(--accent)] px-2.5 py-1 font-medium text-white"
              >
                Skip to End
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
