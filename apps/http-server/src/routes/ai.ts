import { Router } from "express";
import { z } from "zod";

export const aiRouter: Router = Router();

export const AiDiagramStepSchema = z.object({
  title: z.string().min(1).max(120),
  mermaidChunk: z.string().min(1).max(4000),
});

export const AiDiagramPlanSchema = z.object({
  summary: z.string().min(1).max(300).optional(),
  steps: z.array(AiDiagramStepSchema).min(1).max(12),
});

export type AiDiagramPlan = z.infer<typeof AiDiagramPlanSchema>;

export const GenerateDiagramRequestSchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  provider: z
    .enum([
      "openai-compatible",
      "anthropic",
      "gemini",
      "opencode",
      "codex-cli",
      "antigravity-cli",
      "template",
    ])
    .optional()
    .default("template"),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url().optional(),
  model: z.string().trim().max(120).optional(),
  roomId: z.string().trim().optional(),
});

const BUILTIN_TEMPLATES: Record<string, AiDiagramPlan> = {
  "redis-write-behind": {
    summary: "Redis Write-Behind Collaboration Architecture",
    steps: [
      {
        title: "Step 1: Clients & Edge Gateway",
        mermaidChunk: `graph TD
  BrowserA[Browser Tab A] --> Edge[Caddy Edge Proxy]
  BrowserB[Browser Tab B] --> Edge`,
      },
      {
        title: "Step 2: Realtime Services & Redis Delta CAS",
        mermaidChunk: `graph TD
  Edge --> WS[WebSocket Server]
  Edge --> API[HTTP API Server]
  WS --> Redis[(Redis Delta Lua CAS)]
  API --> Redis`,
      },
      {
        title: "Step 3: BullMQ Flush Worker & Postgres Durability",
        mermaidChunk: `graph TD
  Redis --> Queue[BullMQ Flush Queue]
  Queue --> Worker[Flush Worker x8]
  Worker --> Postgres[(PostgreSQL SceneRevision)]`,
      },
    ],
  },
  "rag-pipeline": {
    summary: "Production RAG Pipeline",
    steps: [
      {
        title: "Step 1: Ingestion & Chunking",
        mermaidChunk: `graph LR
  Docs[Source Docs] --> Chunker[Semantic Chunker]
  Chunker --> Embed[Embedding Model]`,
      },
      {
        title: "Step 2: Vector Index & Hybrid Retrieval",
        mermaidChunk: `graph LR
  Embed --> VectorDB[(Vector Database)]
  Query[User Query] --> Retriever[Hybrid Retriever]
  VectorDB --> Retriever`,
      },
      {
        title: "Step 3: Reranker & LLM Synthesis",
        mermaidChunk: `graph LR
  Retriever --> Reranker[Cross-Encoder Reranker]
  Reranker --> LLM[Foundation LLM]
  LLM --> Answer[Grounded Answer]`,
      },
    ],
  },
  "auth-flow": {
    summary: "OAuth + Session Authentication Flow",
    steps: [
      {
        title: "Step 1: Sign-In Entry",
        mermaidChunk: `graph TD
  User[User Browser] --> AuthUI[Sign-In / Sign-Up]
  AuthUI --> BetterAuth[Better Auth Handler]`,
      },
      {
        title: "Step 2: Identity Verification",
        mermaidChunk: `graph TD
  BetterAuth --> OAuth{Google OAuth / Password}
  OAuth --> SessionDB[(Postgres Sessions)]`,
      },
      {
        title: "Step 3: WS Ticket & Room Access",
        mermaidChunk: `graph TD
  SessionDB --> Ticket[Presence Ticket Signer]
  Ticket --> WS[Authenticated WebSocket]`,
      },
    ],
  },
  "er-diagram": {
    summary: "Collaborative Whiteboard ER Model",
    steps: [
      {
        title: "Step 1: Users & Rooms",
        mermaidChunk: `graph LR
  User[User] --> Room[Room]
  User --> RoomMember[RoomMember]
  Room --> RoomMember`,
      },
      {
        title: "Step 2: Scenes & Revisions",
        mermaidChunk: `graph LR
  Room --> Scene[Scene]
  Scene --> SceneRevision[SceneRevision]`,
      },
      {
        title: "Step 3: MCP Tokens & Invites",
        mermaidChunk: `graph LR
  Room --> RoomApiToken[RoomApiToken]
  Room --> RoomInvite[RoomInvite]`,
      },
    ],
  },
};

export function selectTemplatePlan(prompt: string): AiDiagramPlan {
  const lower = prompt.toLowerCase();
  if (lower.includes("rag") || lower.includes("retrieval") || lower.includes("vector")) {
    return BUILTIN_TEMPLATES["rag-pipeline"]!;
  }
  if (lower.includes("auth") || lower.includes("oauth") || lower.includes("login")) {
    return BUILTIN_TEMPLATES["auth-flow"]!;
  }
  if (lower.includes("er ") || lower.includes("entity") || lower.includes("schema") || lower.includes("database")) {
    return BUILTIN_TEMPLATES["er-diagram"]!;
  }
  return BUILTIN_TEMPLATES["redis-write-behind"]!;
}

const SYSTEM_PROMPT = `You are a system architecture diagram planner.
Return ONLY valid JSON matching:
{"summary":"short title","steps":[{"title":"Step 1: ...","mermaidChunk":"graph TD\\n  A[Node] --> B[Node]"}]}
Break the diagram into 3 to 5 topological build steps (Step 1: Entry/Clients, Step 2: Core Services, Step 3: Storage/Async). Every mermaidChunk must be valid Mermaid flowchart syntax.`;

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenAiCompatible(params: {
  prompt: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<AiDiagramPlan> {
  const base = (params.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = params.model || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: params.prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI-compatible provider returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(content));
}

async function callAnthropic(params: {
  prompt: string;
  apiKey: string;
  model?: string;
}): Promise<AiDiagramPlan> {
  const model = params.model || "claude-3-5-sonnet-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic provider returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(text));
}

async function callGemini(params: {
  prompt: string;
  apiKey: string;
  model?: string;
}): Promise<AiDiagramPlan> {
  const model = params.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini provider returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(text));
}

/**
 * POST /api/ai/generate-diagram
 * Supports BYOK OpenAI-compatible, Anthropic, Gemini, local CLI agent bridge
 * (OpenCode, Codex CLI, AntiGravity CLI), and built-in architectural templates.
 */
aiRouter.post("/generate-diagram", async (req, res) => {
  const parsed = GenerateDiagramRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid AI diagram request.",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { prompt, provider, apiKey, baseUrl, model, roomId } = parsed.data;

  // Local CLI agent bridge modes: return exact MCP-ready command + starter plan
  if (
    provider === "opencode" ||
    provider === "codex-cli" ||
    provider === "antigravity-cli"
  ) {
    const fallbackPlan = selectTemplatePlan(prompt);
    const cliCommand =
      provider === "opencode"
        ? `opencode run "Use excalidraw MCP mermaid_to_canvas for room ${roomId ?? "<roomId>"}: ${prompt.replace(/"/g, '\\"')}"`
        : provider === "codex-cli"
          ? `codex exec "Use excalidraw MCP mermaid_to_canvas for room ${roomId ?? "<roomId>"}: ${prompt.replace(/"/g, '\\"')}"`
          : `antigravity run "Use excalidraw MCP mermaid_to_canvas for room ${roomId ?? "<roomId>"}: ${prompt.replace(/"/g, '\\"')}"`;

    res.json({
      provider,
      mode: "local-cli-bridge",
      cliCommand,
      plan: fallbackPlan,
    });
    return;
  }

  const resolvedKey =
    apiKey ||
    (provider === "openai-compatible"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : provider === "gemini"
          ? process.env.GEMINI_API_KEY
          : undefined);

  if (provider === "template" || !resolvedKey) {
    res.json({
      provider: "template",
      mode: "local-template",
      plan: selectTemplatePlan(prompt),
    });
    return;
  }

  try {
    let plan: AiDiagramPlan;
    if (provider === "openai-compatible") {
      plan = await callOpenAiCompatible({
        prompt,
        apiKey: resolvedKey,
        baseUrl,
        model,
      });
    } else if (provider === "anthropic") {
      plan = await callAnthropic({ prompt, apiKey: resolvedKey, model });
    } else {
      plan = await callGemini({ prompt, apiKey: resolvedKey, model });
    }

    res.json({ provider, mode: "byok", plan });
  } catch (error) {
    console.error("AI diagram generation failed:", error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "AI provider failed to generate diagram.",
    });
  }
});
