import type { BoardPresetId, Element } from "@repo/common";
import { getBoardPreset } from "@repo/common";

export type DiagramDirection = "TD" | "LR" | "TB" | "RL";
export type DiagramNodeShape = "rectangle" | "diamond" | "ellipse";

export interface DiagramNode {
  id: string;
  label: string;
  shape: DiagramNodeShape;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface MermaidParseError {
  line: number;
  message: string;
}

export interface ParsedDiagramGraph {
  kind: "flowchart" | "sequence" | "state";
  direction: DiagramDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  errors: MermaidParseError[];
}

export interface GraphLayoutOptions {
  direction?: DiagramDirection;
  originX?: number;
  originY?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  rankGap?: number;
  nodeGap?: number;
  presetId?: BoardPresetId;
  diagramGroupId?: string;
}

function parseNodeToken(raw: string): { id: string; label?: string; shape?: DiagramNodeShape } {
  const token = raw.trim();
  // Match ID with optional shape delimiters: id[label], id{label}, id((label)), id([label]), id[(label)]
  const doubleRound = /^([A-Za-z0-9_-]+)\s*\(\((.+)\)\)$/.exec(token);
  if (doubleRound) {
    return { id: doubleRound[1]!, label: doubleRound[2]!.trim(), shape: "ellipse" };
  }
  const stadium = /^([A-Za-z0-9_-]+)\s*\(\[(.+)\]\)$/.exec(token);
  if (stadium) {
    return { id: stadium[1]!, label: stadium[2]!.trim(), shape: "ellipse" };
  }
  const cylinder = /^([A-Za-z0-9_-]+)\s*\[\((.+)\)\]$/.exec(token);
  if (cylinder) {
    return { id: cylinder[1]!, label: cylinder[2]!.trim(), shape: "rectangle" };
  }
  const diamond = /^([A-Za-z0-9_-]+)\s*\{(.+)\}$/.exec(token);
  if (diamond) {
    return { id: diamond[1]!, label: diamond[2]!.trim(), shape: "diamond" };
  }
  const rect = /^([A-Za-z0-9_-]+)\s*\[(.+)\]$/.exec(token);
  if (rect) {
    return { id: rect[1]!, label: rect[2]!.trim(), shape: "rectangle" };
  }
  const round = /^([A-Za-z0-9_-]+)\s*\((.+)\)$/.exec(token);
  if (round) {
    return { id: round[1]!, label: round[2]!.trim(), shape: "rectangle" };
  }
  const bare = /^([A-Za-z0-9_-]+)$/.exec(token);
  if (bare) {
    return { id: bare[1]! };
  }
  return { id: token.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "node" };
}

/**
 * Parses Mermaid flowcharts (`graph TD/LR`, `flowchart TD/LR`), `sequenceDiagram`,
 * and `stateDiagram-v2` syntax into a structured graph with line-level error hints.
 */
export function parseMermaid(source: string): ParsedDiagramGraph {
  const lines = source.split(/\r?\n/);
  let kind: ParsedDiagramGraph["kind"] = "flowchart";
  let direction: DiagramDirection = "TD";
  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const errors: MermaidParseError[] = [];

  function ensureNode(id: string, label?: string, shape?: DiagramNodeShape): void {
    const cleanLabel = label?.replace(/^["']|["']$/g, "");
    const existing = nodeMap.get(id);
    if (!existing) {
      nodeMap.set(id, {
        id,
        label: cleanLabel || id,
        shape: shape ?? "rectangle",
      });
    } else {
      if (cleanLabel) existing.label = cleanLabel;
      if (shape) existing.shape = shape;
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i]!.trim();
    if (!line || line.startsWith("%%") || line === "end" || line.startsWith("subgraph ")) {
      continue;
    }

    const headerFlow = /^(?:graph|flowchart)\s+(TD|TB|LR|RL)\b/i.exec(line);
    if (headerFlow) {
      kind = "flowchart";
      direction = headerFlow[1]!.toUpperCase() as DiagramDirection;
      continue;
    }
    if (/^sequenceDiagram\b/i.test(line)) {
      kind = "sequence";
      direction = "LR";
      continue;
    }
    if (/^stateDiagram(?:-v2)?\b/i.test(line)) {
      kind = "state";
      direction = "TD";
      continue;
    }

    if (kind === "sequence") {
      const participantMatch = /^(?:participant|actor)\s+([A-Za-z0-9_-]+)(?:\s+as\s+(.+))?$/i.exec(line);
      if (participantMatch) {
        ensureNode(participantMatch[1]!, participantMatch[2]?.trim(), "rectangle");
        continue;
      }
      const seqEdge = /^([A-Za-z0-9_-]+)\s*(?:->>|-->>|->|-->)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
      if (seqEdge) {
        ensureNode(seqEdge[1]!);
        ensureNode(seqEdge[2]!);
        edges.push({ from: seqEdge[1]!, to: seqEdge[2]!, label: seqEdge[3]!.trim() });
        continue;
      }
      errors.push({ line: lineNo, message: `Unrecognized sequence syntax: "${line}"` });
      continue;
    }

    if (kind === "state") {
      const stateEdge = /^(\[\*\]|[A-Za-z0-9_-]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_-]+)(?:\s*:\s*(.+))?$/.exec(line);
      if (stateEdge) {
        const fromId = stateEdge[1] === "[*]" ? "Start" : stateEdge[1]!;
        const toId = stateEdge[2] === "[*]" ? "End" : stateEdge[2]!;
        ensureNode(fromId, fromId, stateEdge[1] === "[*]" ? "ellipse" : "rectangle");
        ensureNode(toId, toId, stateEdge[2] === "[*]" ? "ellipse" : "rectangle");
        edges.push({ from: fromId, to: toId, label: stateEdge[3]?.trim() });
        continue;
      }
    }

    // Flowchart edge: A[Label] -->|edge label| B{Decision}  OR  A -- edge label --> B
    const labeledPipe = /^(.+?)\s*(?:-->|---|-\.->|==>)\s*\|([^|]+)\|\s*(.+)$/.exec(line);
    if (labeledPipe) {
      const left = parseNodeToken(labeledPipe[1]!);
      const right = parseNodeToken(labeledPipe[3]!);
      ensureNode(left.id, left.label, left.shape);
      ensureNode(right.id, right.label, right.shape);
      edges.push({ from: left.id, to: right.id, label: labeledPipe[2]!.trim() });
      continue;
    }

    const plainEdge = /^(.+?)\s*(?:-->|---|-\.->|==>)\s*(.+)$/.exec(line);
    if (plainEdge) {
      const left = parseNodeToken(plainEdge[1]!);
      const right = parseNodeToken(plainEdge[2]!);
      ensureNode(left.id, left.label, left.shape);
      ensureNode(right.id, right.label, right.shape);
      edges.push({ from: left.id, to: right.id });
      continue;
    }

    // Standalone node declaration
    if (/^[A-Za-z0-9_-]+\s*(\[|\{|\()/.test(line)) {
      const single = parseNodeToken(line);
      ensureNode(single.id, single.label, single.shape);
      continue;
    }

    errors.push({ line: lineNo, message: `Could not parse line: "${line}"` });
  }

  return {
    kind,
    direction,
    nodes: [...nodeMap.values()],
    edges,
    errors,
  };
}

/**
 * Layered topological auto-layout (Dagre-style rank assignment + centered layer
 * packing) guaranteeing zero overlapping node bounding boxes, outputting valid
 * Excalidraw shapes, bound labels, and connecting arrows.
 */
export function layoutGraphToElements(
  graph: {
    nodes: readonly DiagramNode[];
    edges: readonly DiagramEdge[];
    direction?: DiagramDirection;
  },
  options: GraphLayoutOptions = {},
): Element[] {
  const direction = options.direction ?? graph.direction ?? "TD";
  const isHorizontal = direction === "LR" || direction === "RL";
  const nodeWidth = options.nodeWidth ?? 180;
  const nodeHeight = options.nodeHeight ?? 68;
  const rankGap = options.rankGap ?? 100;
  const nodeGap = options.nodeGap ?? 56;
  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const groupId = options.diagramGroupId ?? `diagram-${Date.now()}`;
  const preset = getBoardPreset(options.presetId ?? "clean-sketch");

  const nodes = [...graph.nodes];
  if (nodes.length === 0) return [];

  // Assign topological ranks via longest-path BFS (cycle-safe)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!adj.has(e.from) || !inDegree.has(e.to) || e.from === e.to) continue;
    adj.get(e.from)!.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      rank.set(n.id, 0);
      queue.push(n.id);
    }
  }
  if (queue.length === 0) {
    rank.set(nodes[0]!.id, 0);
    queue.push(nodes[0]!.id);
  }

  let head = 0;
  const maxRank = nodes.length;
  while (head < queue.length) {
    const current = queue[head++]!;
    const currentRank = rank.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      const candidateRank = Math.min(maxRank, currentRank + 1);
      if (candidateRank > (rank.get(next) ?? -1)) {
        rank.set(next, candidateRank);
        queue.push(next);
      }
    }
  }

  // Ensure disconnected or cycle-only nodes receive a deterministic rank
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  }

  const layers = new Map<number, DiagramNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    const bucket = layers.get(r) ?? [];
    bucket.push(n);
    layers.set(r, bucket);
  }

  const sortedRanks = [...layers.keys()].sort((a, b) =>
    direction === "RL" ? b - a : a - b,
  );
  const maxLayerSize = Math.max(
    1,
    ...[...layers.values()].map((bucket) => bucket.length),
  );

  const boxByNodeId = new Map<
    string,
    { elementId: string; x: number; y: number; width: number; height: number }
  >();
  const elements: Element[] = [];
  const now = Date.now();
  let seedCounter = 1001;

  sortedRanks.forEach((r, layerIndex) => {
    const bucket = layers.get(r)!;
    const totalCrossSpan =
      maxLayerSize * (isHorizontal ? nodeHeight : nodeWidth) +
      (maxLayerSize - 1) * nodeGap;
    const layerCrossSpan =
      bucket.length * (isHorizontal ? nodeHeight : nodeWidth) +
      (bucket.length - 1) * nodeGap;
    const crossStartOffset = (totalCrossSpan - layerCrossSpan) / 2;

    bucket.forEach((node, idx) => {
      const x = isHorizontal
        ? originX + layerIndex * (nodeWidth + rankGap)
        : originX + crossStartOffset + idx * (nodeWidth + nodeGap);
      const y = isHorizontal
        ? originY + crossStartOffset + idx * (nodeHeight + nodeGap)
        : originY + layerIndex * (nodeHeight + rankGap);

      const shapeId = `${groupId}-node-${node.id}`;
      const textId = `${groupId}-text-${node.id}`;
      const strokeColor = preset.palette[layerIndex % preset.palette.length] ?? preset.defaultStrokeColor;

      boxByNodeId.set(node.id, {
        elementId: shapeId,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
      });

      elements.push({
        id: shapeId,
        type: node.shape,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        angle: 0,
        strokeColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: preset.strokeWidth,
        strokeStyle: "solid",
        roughness: preset.roughness,
        opacity: 100,
        seed: seedCounter++,
        version: 1,
        versionNonce: seedCounter * 97,
        isDeleted: false,
        groupIds: [groupId],
        boundElements: [{ id: textId, type: "text" }],
        updated: now,
      } as unknown as Element);

      elements.push({
        id: textId,
        type: "text",
        x: x + 12,
        y: y + nodeHeight / 2 - 10,
        width: nodeWidth - 24,
        height: 22,
        angle: 0,
        text: node.label,
        fontSize: 16,
        fontFamily: preset.fontFamily,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: shapeId,
        strokeColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        seed: seedCounter++,
        version: 1,
        versionNonce: seedCounter * 131,
        isDeleted: false,
        groupIds: [groupId],
        updated: now,
      } as unknown as Element);
    });
  });

  // Generate arrows connecting source and target edge midpoints
  graph.edges.forEach((edge, idx) => {
    const src = boxByNodeId.get(edge.from);
    const dst = boxByNodeId.get(edge.to);
    if (!src || !dst) return;

    const startX = isHorizontal ? src.x + src.width : src.x + src.width / 2;
    const startY = isHorizontal ? src.y + src.height / 2 : src.y + src.height;
    const endX = isHorizontal ? dst.x : dst.x + dst.width / 2;
    const endY = isHorizontal ? dst.y + dst.height / 2 : dst.y;

    const dx = endX - startX;
    const dy = endY - startY;
    const arrowId = `${groupId}-edge-${idx}-${edge.from}-${edge.to}`;

    elements.push({
      id: arrowId,
      type: "arrow",
      x: startX,
      y: startY,
      width: Math.abs(dx),
      height: Math.abs(dy),
      points: [
        [0, 0],
        [dx, dy],
      ],
      angle: 0,
      strokeColor: preset.defaultStrokeColor,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: preset.strokeWidth,
      strokeStyle: "solid",
      roughness: preset.roughness,
      opacity: 100,
      seed: seedCounter++,
      version: 1,
      versionNonce: seedCounter * 149,
      isDeleted: false,
      groupIds: [groupId],
      startBinding: { elementId: src.elementId, focus: 0, gap: 4 },
      endBinding: { elementId: dst.elementId, focus: 0, gap: 4 },
      updated: now,
    } as unknown as Element);

    if (edge.label) {
      elements.push({
        id: `${arrowId}-label`,
        type: "text",
        x: startX + dx / 2 - 48,
        y: startY + dy / 2 - 10,
        width: 96,
        height: 20,
        angle: 0,
        text: edge.label,
        fontSize: 13,
        fontFamily: preset.fontFamily,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: arrowId,
        strokeColor: preset.defaultStrokeColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        seed: seedCounter++,
        version: 1,
        versionNonce: seedCounter * 173,
        isDeleted: false,
        groupIds: [groupId],
        updated: now,
      } as unknown as Element);
    }
  });

  return elements;
}

export function mermaidToCanvasElements(
  source: string,
  options: GraphLayoutOptions = {},
): { parsed: ParsedDiagramGraph; elements: Element[] } {
  const parsed = parseMermaid(source);
  const elements = layoutGraphToElements(parsed, {
    ...options,
    direction: options.direction ?? parsed.direction,
  });
  return { parsed, elements };
}

/**
 * Non-destructive merge helper:
 * - `"insert"`: appends generated diagram elements without touching existing ones.
 * - `"replace"`: marks only elements belonging to `diagramGroupId` as deleted and
 *   replaces them with the newly generated diagram elements.
 */
export function mergeDiagramElements(
  existing: readonly Element[],
  generated: readonly Element[],
  mode: "insert" | "replace",
  diagramGroupId: string,
): Element[] {
  if (mode === "insert") {
    return [...existing, ...generated];
  }
  const preserved = existing.filter((el) => {
    const groups = (el as { groupIds?: string[] }).groupIds;
    return !Array.isArray(groups) || !groups.includes(diagramGroupId);
  });
  return [...preserved, ...generated];
}
