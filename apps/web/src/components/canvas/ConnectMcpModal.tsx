"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api/client";

type McpClientTab =
  | "cursor"
  | "claude-code"
  | "opencode"
  | "codex-cli"
  | "antigravity-cli";

interface TokenItem {
  id: string;
  label: string;
  role: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface ConnectMcpModalProps {
  open: boolean;
  roomId?: string;
  sceneId?: string;
  onClose: () => void;
}

function buildConfigSnippet(
  client: McpClientTab,
  mcpUrl: string,
  token: string,
): string {
  const bearer = token || "<MINT_OR_PASTE_ROOM_API_TOKEN>";
  if (client === "cursor") {
    return JSON.stringify(
      {
        mcpServers: {
          "excalidraw-room": {
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${bearer}`,
            },
          },
        },
      },
      null,
      2,
    );
  }
  if (client === "claude-code") {
    return `claude mcp add --transport http excalidraw-room "${mcpUrl}" \\\n  --header "Authorization: Bearer ${bearer}"`;
  }
  if (client === "opencode") {
    return JSON.stringify(
      {
        mcp: {
          "excalidraw-room": {
            type: "remote",
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${bearer}`,
            },
          },
        },
      },
      null,
      2,
    );
  }
  if (client === "codex-cli") {
    return `[mcp_servers.excalidraw_room]\nurl = "${mcpUrl}"\nhttp_headers = { Authorization = "Bearer ${bearer}" }`;
  }
  // antigravity-cli
  return JSON.stringify(
    {
      mcpServers: {
        "excalidraw-room": {
          transport: "streamable-http",
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        },
      },
    },
    null,
    2,
  );
}

export function ConnectMcpModal({
  open,
  roomId,
  sceneId,
  onClose,
}: ConnectMcpModalProps) {
  const [clientTab, setClientTab] = useState<McpClientTab>("cursor");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [expiresInHours, setExpiresInHours] = useState<number>(168);
  const [label, setLabel] = useState("Local Coding Agent");
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [mintedSecret, setMintedSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const numericRoomId = Number(roomId ?? 0);
  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/$/, "")}/api/mcp`
      : apiUrl("/api/mcp");

  useEffect(() => {
    if (!open || !Number.isSafeInteger(numericRoomId) || numericRoomId <= 0) {
      return;
    }
    let active = true;
    void fetch(apiUrl(`/api/mcp/tokens/${numericRoomId}`), {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { tokens?: TokenItem[] };
        if (active) setTokens(data.tokens ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open, numericRoomId]);

  if (!open) return null;

  async function handleMint() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/mcp/tokens"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: numericRoomId > 0 ? numericRoomId : 1,
          sceneId: sceneId || `room-${numericRoomId > 0 ? numericRoomId : 1}`,
          role,
          label,
          expiresInHours,
        }),
      });
      if (!res.ok) throw new Error(`Could not mint token (${res.status})`);
      const data = (await res.json()) as { token: string; record: TokenItem };
      setMintedSecret(data.token);
      setTokens((prev) => [data.record, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mint token.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    try {
      const res = await fetch(
        apiUrl(`/api/mcp/tokens/${encodeURIComponent(tokenId)}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
      setTokens((prev) =>
        prev.map((t) =>
          t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token.");
    }
  }

  const snippet = buildConfigSnippet(clientTab, mcpUrl, mintedSecret);

  return (
    <div
      data-editor-chrome
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-[var(--text-primary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Connect MCP Coding Agent</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Mint a scoped room token so Cursor, Claude Code, OpenCode, Codex CLI,
              or AntiGravity CLI can draw live on this board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Connect MCP Modal"
            className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
          >
            ✕
          </button>
        </div>

        {/* Mint token controls */}
        <div className="mt-4 grid gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 text-xs sm:grid-cols-4">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Token label"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 outline-none sm:col-span-2"
          />
          <select
            aria-label="Token role"
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            aria-label="Token expiry"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5"
          >
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleMint()}
            className="sm:col-span-4 rounded-xl bg-[var(--accent)] py-2 font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? "Minting scoped token…" : "Mint New Room API Token"}
          </button>
        </div>

        {/* Client config snippets */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["cursor", "Cursor"],
                ["claude-code", "Claude Code"],
                ["opencode", "OpenCode"],
                ["codex-cli", "Codex CLI"],
                ["antigravity-cli", "AntiGravity CLI"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                onClick={() => setClientTab(id)}
                className={`rounded-full px-3 py-1 font-medium ${
                  clientTab === id
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="relative mt-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(snippet);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="absolute right-2.5 top-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--bg-surface)]"
            >
              {copied ? "Copied!" : "Copy config"}
            </button>
            <pre className="overflow-x-auto pr-20 font-mono text-[11px] leading-relaxed text-[var(--text-primary)]">
              {snippet}
            </pre>
          </div>
        </div>

        {/* Active / revoked tokens */}
        {tokens.length > 0 && (
          <div className="mt-4 max-h-36 overflow-y-auto space-y-1.5 text-xs">
            <div className="font-semibold text-[var(--text-muted)]">
              Room Tokens ({tokens.length})
            </div>
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5"
              >
                <div>
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                    {t.role} · expires {new Date(t.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                {t.revokedAt ? (
                  <span className="text-[11px] text-rose-400">Revoked</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(t.id)}
                    className="rounded-md border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/15"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
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
