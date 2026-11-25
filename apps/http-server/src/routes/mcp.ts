import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type { BoardPresetId, Element } from "@repo/common";
import { layoutGraphToElements, mermaidToCanvasElements } from "@repo/common";
import { db } from "@repo/db";
import {
  createCollaborationService,
  type CollaborationService,
} from "@repo/backend-common";
import type { RoomRedis } from "@repo/redis";
import { verifyRoomApiToken, type RoomApiTokenRecord } from "./mcpTokens.js";

export interface McpServerDeps {
  getCollaborationService?: () => Pick<
    CollaborationService,
    "applyCommit" | "readSyncScene"
  >;
  getRoomRedis?: () => Pick<RoomRedis, "publish"> | null;
  verifyToken?: typeof verifyRoomApiToken;
}

let configuredDeps: McpServerDeps = {};

export function configureMcpServerDeps(deps: McpServerDeps): void {
  configuredDeps = { ...configuredDeps, ...deps };
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  {
    name: "get_scene_outline",
    description:
      "Returns a compact semantic summary of nodes, labels, shapes, frames, and connections currently on the board.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_diagram_from_graph",
    description:
      "Creates a clean, zero-overlap diagram on the live canvas from structured nodes and edges using server-side layered auto-layout.",
    inputSchema: {
      type: "object",
      required: ["nodes"],
      properties: {
        nodes: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              shape: {
                type: "string",
                enum: ["rectangle", "diamond", "ellipse"],
              },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string" },
            },
          },
        },
        direction: { type: "string", enum: ["TD", "LR", "TB", "RL"] },
        preset: {
          type: "string",
          enum: ["black-and-white", "excali-font", "chalk-bold", "clean-sketch"],
        },
      },
    },
  },
  {
    name: "mermaid_to_canvas",
    description:
      "Converts Mermaid flowchart/sequence/state syntax into Excalidraw elements with zero-overlap auto-layout and merges onto the live room canvas.",
    inputSchema: {
      type: "object",
      required: ["mermaid"],
      properties: {
        mermaid: { type: "string" },
        preset: {
          type: "string",
          enum: ["black-and-white", "excali-font", "chalk-bold", "clean-sketch"],
        },
      },
    },
  },
  {
    name: "patch_elements",
    description:
      "Applies element-level create, update, or soft-delete (`isDeleted: true`) patches directly to the live room.",
    inputSchema: {
      type: "object",
      required: ["elements"],
      properties: {
        elements: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "render_scene_svg",
    description:
      "Renders a clean SVG snapshot of the current room canvas so the calling AI agent can visually inspect layout quality and check for overlaps.",
    inputSchema: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["dark", "light"] },
      },
    },
  },
];

interface SimpleNode {
  id: string;
  label: string;
  shape?: "rectangle" | "diamond" | "ellipse";
}
interface SimpleEdge {
  from: string;
  to: string;
  label?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderElementsToSvg(
  elements: readonly Element[],
  theme: "dark" | "light" = "dark",
): string {
  const active = elements.filter((e) => !e.isDeleted);
  const bg = theme === "dark" ? "#0D1117" : "#FFFFFF";
  const fg = theme === "dark" ? "#F1F5F9" : "#111827";

  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 500;
  for (const el of active) {
    minX = Math.min(minX, el.x - 40);
    minY = Math.min(minY, el.y - 40);
    maxX = Math.max(maxX, el.x + (el.width ?? 120) + 40);
    maxY = Math.max(maxY, el.y + (el.height ?? 60) + 40);
  }
  const width = Math.max(200, Math.round(maxX - minX));
  const height = Math.max(200, Math.round(maxY - minY));

  const body: string[] = [];
  for (const el of active) {
    const stroke = el.strokeColor || fg;
    if (el.type === "rectangle" || el.type === "frame") {
      body.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.width ?? 120}" height="${el.height ?? 60}" rx="8" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth ?? 2}" />`,
      );
    } else if (el.type === "ellipse") {
      const rx = (el.width ?? 100) / 2;
      const ry = (el.height ?? 60) / 2;
      body.push(
        `<ellipse cx="${el.x + rx}" cy="${el.y + ry}" rx="${rx}" ry="${ry}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth ?? 2}" />`,
      );
    } else if (el.type === "diamond") {
      const w = el.width ?? 120;
      const h = el.height ?? 70;
      const pts = `${el.x + w / 2},${el.y} ${el.x + w},${el.y + h / 2} ${el.x + w / 2},${el.y + h} ${el.x},${el.y + h / 2}`;
      body.push(
        `<polygon points="${pts}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth ?? 2}" />`,
      );
    } else if (el.type === "arrow" || el.type === "line") {
      const rawPts = (el as unknown as { points?: unknown[] }).points;
      const pts: [number, number][] = Array.isArray(rawPts)
        ? rawPts.map((pt) =>
            Array.isArray(pt)
              ? [Number(pt[0] ?? 0), Number(pt[1] ?? 0)]
              : [
                  Number((pt as { x?: number }).x ?? 0),
                  Number((pt as { y?: number }).y ?? 0),
                ],
          )
        : [
            [0, 0],
            [el.width ?? 80, el.height ?? 0],
          ];
      const d = pts
        .map(([px, py], i) => `${i === 0 ? "M" : "L"}${el.x + px} ${el.y + py}`)
        .join(" ");
      body.push(
        `<path d="${d}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${el.strokeWidth ?? 2}" />`,
      );
    } else if (el.type === "text") {
      const txt = (el as { text?: string }).text ?? "";
      body.push(
        `<text x="${el.x + (el.width ?? 0) / 2}" y="${el.y + 16}" text-anchor="middle" fill="${escapeXml(fg)}" font-family="sans-serif" font-size="14">${escapeXml(txt)}</text>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bg}" />${body.join("")}</svg>`;
}

async function authenticateBearer(req: Request): Promise<RoomApiTokenRecord | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const rawToken = header.slice("Bearer ".length).trim();
  return (configuredDeps.verifyToken ?? verifyRoomApiToken)(rawToken);
}

function sendRpcResult(res: Response, id: string | number | null, result: unknown) {
  res.status(200).json({ jsonrpc: "2.0", id, result });
}

function sendRpcError(
  res: Response,
  id: string | number | null,
  code: number,
  message: string,
  httpStatus = 200,
) {
  res.status(httpStatus).json({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

export const mcpRouter: Router = Router();

/**
 * POST /api/mcp
 * Streamable HTTP JSON-RPC 2.0 MCP Server authenticated via Bearer RoomApiToken.
 */
mcpRouter.post("/", async (req, res) => {
  const tokenRecord = await authenticateBearer(req);
  if (!tokenRecord) {
    res.status(401).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Unauthorized: invalid, expired, or revoked RoomApiToken." },
    });
    return;
  }

  const rpc = (req.body ?? {}) as JsonRpcRequest;
  const rpcId = rpc.id ?? null;

  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    sendRpcError(res, rpcId, -32600, "Invalid JSON-RPC 2.0 request.", 400);
    return;
  }

  if (rpc.method === "initialize") {
    sendRpcResult(res, rpcId, {
      protocolVersion: "2025-03-26",
      serverInfo: {
        name: "excalidraw-room-mcp",
        version: "1.0.0",
      },
      capabilities: {
        tools: { listChanged: false },
      },
    });
    return;
  }

  if (rpc.method === "notifications/initialized") {
    res.status(202).end();
    return;
  }

  if (rpc.method === "tools/list") {
    sendRpcResult(res, rpcId, { tools: MCP_TOOLS });
    return;
  }

  if (rpc.method !== "tools/call") {
    sendRpcError(res, rpcId, -32601, `Method not found: ${rpc.method}`);
    return;
  }

  const params = rpc.params ?? {};
  const toolName = typeof params.name === "string" ? params.name : "";
  const args = (
    typeof params.arguments === "object" && params.arguments !== null
      ? params.arguments
      : {}
  ) as Record<string, unknown>;

  const collab =
    configuredDeps.getCollaborationService?.() ??
    createCollaborationService({ store: db });
  const redis = configuredDeps.getRoomRedis?.() ?? null;

  async function commitAndBroadcast(elements: unknown[]) {
    const mutationId = `mcp-${randomUUID()}`;
    const result = await collab.applyCommit({
      sceneId: tokenRecord!.sceneId,
      userId: tokenRecord!.createdById,
      role: tokenRecord!.role,
      elements,
      mutationId,
    });
    if (!result.saved) {
      throw new Error(`Commit failed: ${result.reason ?? "unknown"}`);
    }
    if (redis) {
      await redis
        .publish({
          type: "room.broadcast",
          roomId: tokenRecord!.roomId,
          sceneId: tokenRecord!.sceneId,
          message: {
            type: "elements.committed",
            revision: result.revision,
            elements: result.winners,
            mutationId,
          },
        })
        .catch(() => undefined);
    }
    return result;
  }

  try {
    if (toolName === "get_scene_outline") {
      const scene = await collab.readSyncScene(tokenRecord.sceneId);
      const elements = (scene?.elements ?? []).filter((e) => !e.isDeleted);
      const outline = {
        sceneId: tokenRecord.sceneId,
        revision: scene?.revision ?? 0,
        totalElements: elements.length,
        shapes: elements
          .filter((e) => e.type !== "text" && e.type !== "arrow")
          .map((e) => ({
            id: e.id,
            type: e.type,
            x: Math.round(e.x),
            y: Math.round(e.y),
            width: Math.round(e.width ?? 0),
            height: Math.round(e.height ?? 0),
          })),
        labels: elements
          .filter((e) => e.type === "text")
          .map((e) => ({
            id: e.id,
            text: (e as { text?: string }).text ?? "",
            containerId: (e as { containerId?: string }).containerId ?? null,
          })),
        connections: elements.filter((e) => e.type === "arrow").length,
      };
      sendRpcResult(res, rpcId, {
        content: [{ type: "text", text: JSON.stringify(outline, null, 2) }],
      });
      return;
    }

    if (toolName === "create_diagram_from_graph") {
      const nodes = Array.isArray(args.nodes) ? (args.nodes as SimpleNode[]) : [];
      const edges = Array.isArray(args.edges) ? (args.edges as SimpleEdge[]) : [];
      const direction =
        args.direction === "LR" ||
        args.direction === "TB" ||
        args.direction === "RL"
          ? args.direction
          : "TD";
      const preset = (
        typeof args.preset === "string" ? args.preset : "clean-sketch"
      ) as BoardPresetId;
      const generated = layoutGraphToElements({
        nodes: nodes.map((node) => ({ ...node, shape: node.shape ?? "rectangle" })),
        edges, direction,
      }, { presetId: preset, diagramGroupId: `mcp-${randomUUID().slice(0, 13)}` });
      const committed = await commitAndBroadcast(generated);
      sendRpcResult(res, rpcId, {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              committed: true,
              revision: committed.revision,
              elementCount: committed.winners.length,
            }),
          },
        ],
      });
      return;
    }

    if (toolName === "mermaid_to_canvas") {
      const source = typeof args.mermaid === "string" ? args.mermaid : "";
      const preset = (
        typeof args.preset === "string" ? args.preset : "clean-sketch"
      ) as BoardPresetId;
      const { parsed, elements: generated } = mermaidToCanvasElements(source, {
        presetId: preset,
        diagramGroupId: `mcp-${randomUUID().slice(0, 13)}`,
      });
      const committed = await commitAndBroadcast(generated);
      sendRpcResult(res, rpcId, {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              committed: true,
              revision: committed.revision,
              nodes: parsed.nodes.length,
              edges: parsed.edges.length,
              elementCount: committed.winners.length,
            }),
          },
        ],
      });
      return;
    }

    if (toolName === "patch_elements") {
      const patch = Array.isArray(args.elements) ? args.elements : [];
      const committed = await commitAndBroadcast(patch);
      sendRpcResult(res, rpcId, {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              committed: true,
              revision: committed.revision,
              winners: committed.winners.length,
            }),
          },
        ],
      });
      return;
    }

    if (toolName === "render_scene_svg") {
      const scene = await collab.readSyncScene(tokenRecord.sceneId);
      const theme = args.theme === "light" ? "light" : "dark";
      const svg = renderElementsToSvg(scene?.elements ?? [], theme);
      sendRpcResult(res, rpcId, {
        content: [{ type: "text", text: svg }],
      });
      return;
    }

    sendRpcError(res, rpcId, -32602, `Unknown MCP tool: ${toolName}`);
  } catch (error) {
    sendRpcError(
      res,
      rpcId,
      -32000,
      error instanceof Error ? error.message : "Tool execution failed.",
    );
  }
});
