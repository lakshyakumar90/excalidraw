import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { validateSyncBatch } from "@repo/common";

export const aiRouter: Router = Router();
export const localCliRouter: Router = Router();

const AiMermaidStepSchema = z.strictObject({
  title: z.string().min(1).max(120),
  mermaidChunk: z.string().min(1).max(4000),
});
const AiElementsStepSchema = z.strictObject({
  title: z.string().min(1).max(120),
  elements: z.array(z.unknown()).transform((elements, context) => {
    const result = validateSyncBatch(elements);
    if (!result.ok) {
      context.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.elements;
  }),
});
export const AiDiagramStepSchema = z.union([AiMermaidStepSchema, AiElementsStepSchema]);

export const AiDiagramPlanSchema = z.strictObject({
  summary: z.string().min(1).max(300).optional(),
  steps: z.array(AiDiagramStepSchema).min(1).max(12),
});

export type AiDiagramPlan = z.infer<typeof AiDiagramPlanSchema>;

export type AiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

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
    ])
    .optional()
    .default("opencode"),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url().optional(),
  model: z.string().trim().max(120).optional(),
  roomId: z.string().trim().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

const SYSTEM_PROMPT = `You are a system architecture diagram planner.
Return ONLY valid JSON matching:
{"summary":"short title","steps":[{"title":"Step 1: ...","mermaidChunk":"graph TD\\n  A[Node] --> B[Node]"}]}
Break the diagram into 2 to 4 topological build steps (Step 1: Entry/Clients, Step 2: Core Services, Step 3: Storage/Async). Every mermaidChunk must be valid Mermaid flowchart syntax (graph TD or graph LR). Do not include markdown fences or commentary outside the JSON object.`;

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

async function readUpstreamError(res: Response, label: string): Promise<Error> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const msg =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message || parsed.message;
    if (msg) return new Error(`${label} (HTTP ${res.status}): ${msg}`);
  } catch {
    // Ignore non-JSON error body.
  }
  return new Error(
    raw.trim()
      ? `${label} (HTTP ${res.status}): ${raw.trim().slice(0, 200)}`
      : `${label} returned HTTP ${res.status}`,
  );
}

async function callOpenAiCompatible(params: {
  prompt: string;
  history: AiHistoryMessage[];
  apiKey: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<AiDiagramPlan> {
  const base = (params.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = params.model || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: params.signal,
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
        ...params.history,
        { role: "user", content: params.prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw await readUpstreamError(res, "OpenAI-compatible provider");
  }
  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(content));
}

async function callAnthropic(params: {
  prompt: string;
  history: AiHistoryMessage[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<AiDiagramPlan> {
  const model = params.model || "claude-sonnet-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: params.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [...params.history, { role: "user", content: params.prompt }],
    }),
  });
  if (!res.ok) {
    throw await readUpstreamError(res, "Anthropic provider");
  }
  const payload = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(text));
}

async function callGemini(params: {
  prompt: string;
  history: AiHistoryMessage[];
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<AiDiagramPlan> {
  const model = params.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    signal: params.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        ...params.history.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        })),
        { role: "user", parts: [{ text: params.prompt }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) {
    throw await readUpstreamError(res, "Gemini provider");
  }
  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return AiDiagramPlanSchema.parse(extractJsonObject(text));
}

function execProcess(params: {
  command: string;
  args: string[];
  stdinText?: string;
  shell?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (params.signal?.aborted) {
      reject(new Error("Request cancelled."));
      return;
    }

    const child = spawn(params.command, params.args, {
      shell: params.shell ?? false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      params.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(new Error("Request cancelled."));
    };

    params.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(new Error(`${params.command} timed out after ${Math.round((params.timeoutMs ?? 90_000) / 1000)}s.`));
    }, params.timeoutMs ?? 90_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code !== 0) {
        const detail = (stderr || stdout).trim().slice(0, 300);
        reject(new Error(detail || `${params.command} exited with code ${code}.`));
        return;
      }
      resolve({ stdout, stderr });
    });

    if (params.stdinText !== undefined) {
      child.stdin.write(params.stdinText);
    }
    child.stdin.end();
  });
}

async function callLocalCli(params: {
  provider: "opencode" | "codex-cli" | "antigravity-cli";
  prompt: string;
  history: AiHistoryMessage[];
  model?: string;
  signal?: AbortSignal;
}): Promise<AiDiagramPlan> {
  const historyBlock =
    params.history.length > 0
      ? `\n\nConversation context:\n${params.history
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")}`
      : "";
  const fullPrompt = `${SYSTEM_PROMPT}${historyBlock}\n\nUser request: ${params.prompt}`;
  const workDir = await mkdtemp(join(tmpdir(), "chitran-ai-"));

  try {
    if (params.provider === "codex-cli") {
      const outputFile = join(workDir, "codex-last.txt");
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "-s",
        "read-only",
        "-o",
        outputFile,
      ];
      if (params.model) {
        args.push("-m", params.model);
      }
      args.push("-");
      const { stdout } = await execProcess({
        command: "codex",
        args,
        stdinText: fullPrompt,
        shell: process.platform === "win32",
        signal: params.signal,
      });
      const fileText = await readFile(outputFile, "utf8").catch(() => "");
      return AiDiagramPlanSchema.parse(extractJsonObject(fileText || stdout));
    }

    if (params.provider === "opencode") {
      const promptFile = join(workDir, "prompt.txt");
      await writeFile(promptFile, fullPrompt, "utf8");
      const args = ["run", "--archived", "--format", "default", "--file", promptFile];
      if (params.model) {
        args.push("--model", params.model);
      }
      args.push("Read the attached prompt.txt and return ONLY the JSON object.");
      const { stdout } = await execProcess({
        command: "opencode",
        args,
        shell: process.platform === "win32",
        signal: params.signal,
      });
      return AiDiagramPlanSchema.parse(extractJsonObject(stdout));
    }

    // antigravity-cli (agy)
    const args = ["-p", fullPrompt, "--output-format", "text"];
    if (params.model) {
      args.push("--model", params.model);
    }
    const { stdout } = await execProcess({
      command: "agy",
      args,
      shell: false,
      signal: params.signal,
    });
    return AiDiagramPlanSchema.parse(extractJsonObject(stdout));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function isCommandMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === "ENOENT" ||
    Boolean(err.message && /\bENOENT\b/i.test(err.message))
  );
}

localCliRouter.use((req, res, next) => {
  const host = req.hostname?.toLowerCase();
  if (
    process.env.NODE_ENV === "production" ||
    (host !== "127.0.0.1" && host !== "localhost")
  ) {
    res.status(403).json({
      error: "Local CLI endpoint is only available on localhost.",
    });
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

localCliRouter.post("/generate-diagram", async (req, res) => {
  const parsed = GenerateDiagramRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid AI diagram request.",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { prompt, provider, model, history } = parsed.data;
  if (
    provider !== "opencode" &&
    provider !== "codex-cli" &&
    provider !== "antigravity-cli"
  ) {
    res.status(400).json({
      error: "Local CLI endpoint only accepts opencode, codex-cli, or antigravity-cli.",
    });
    return;
  }

  const controller = new AbortController();
  const handleClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("close", handleClose);

  try {
    const plan = await callLocalCli({
      provider,
      prompt,
      history,
      model,
      signal: controller.signal,
    });
    if (!controller.signal.aborted) {
      res.json({ provider, mode: "local-cli", plan });
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    if (isCommandMissingError(error)) {
      res.status(404).json({
        error: `${provider} CLI is not installed or not on PATH on this computer.`,
      });
      return;
    }
    console.error(`Local CLI (${provider}) diagram generation failed:`, error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : `Local CLI (${provider}) failed to generate diagram.`,
    });
  } finally {
    req.off("close", handleClose);
  }
});

const ListModelsRequestSchema = z.object({
  provider: z.enum(["openai-compatible", "anthropic", "gemini"]),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url().optional(),
});

aiRouter.post("/models", async (req, res) => {
  const parsed = ListModelsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid model list request." });
    return;
  }

  const { provider, apiKey, baseUrl } = parsed.data;
  const resolvedKey =
    apiKey ||
    (provider === "openai-compatible"
      ? process.env.OPENAI_API_KEY
      : provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.GEMINI_API_KEY);

  if (!resolvedKey) {
    res.status(400).json({ error: `Enter an API key for ${provider} to fetch models.` });
    return;
  }

  try {
    if (provider === "openai-compatible") {
      const base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
      const upstream = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${resolvedKey}` },
      });
      if (!upstream.ok) throw await readUpstreamError(upstream, "OpenAI-compatible models");
      const payload = (await upstream.json()) as { data?: { id?: string }[] };
      const models = (payload.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id))
        .sort();
      res.json({ models });
      return;
    }

    if (provider === "anthropic") {
      const upstream = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": resolvedKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!upstream.ok) throw await readUpstreamError(upstream, "Anthropic models");
      const payload = (await upstream.json()) as { data?: { id?: string }[] };
      const models = (payload.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));
      res.json({ models });
      return;
    }

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(resolvedKey)}`,
    );
    if (!upstream.ok) throw await readUpstreamError(upstream, "Gemini models");
    const payload = (await upstream.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const models = (payload.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name?.replace(/^models\//, ""))
      .filter((id): id is string => Boolean(id));
    res.json({ models });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Could not fetch models.",
    });
  }
});

/**
 * POST /api/ai/generate-diagram
 * Supports BYOK (OpenAI-compatible, Anthropic, Gemini) and local CLI
 * execution (OpenCode, Codex CLI, AntiGravity CLI).
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

  const { prompt, provider, apiKey, baseUrl, model, history } = parsed.data;
  const controller = new AbortController();
  const handleClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("close", handleClose);

  try {
    if (
      provider === "opencode" ||
      provider === "codex-cli" ||
      provider === "antigravity-cli"
    ) {
      try {
        const plan = await callLocalCli({
          provider,
          prompt,
          history,
          model,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          res.json({ provider, mode: "local-cli", plan });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isCommandMissingError(error)) {
          res.status(404).json({
            error: `${provider} CLI is not installed on this server.`,
          });
          return;
        }
        console.error(`Local CLI (${provider}) diagram generation failed:`, error);
        res.status(502).json({
          error:
            error instanceof Error
              ? error.message
              : `Local CLI (${provider}) failed to generate diagram.`,
        });
      }
      return;
    }

    const resolvedKey =
      apiKey ||
      (provider === "openai-compatible"
        ? process.env.OPENAI_API_KEY
        : provider === "anthropic"
          ? process.env.ANTHROPIC_API_KEY
          : process.env.GEMINI_API_KEY);

    if (!resolvedKey) {
      res.status(400).json({
        error: `API key is required for ${provider}. Open Connect AI to enter your key or select a local CLI.`,
      });
      return;
    }

    try {
      let plan: AiDiagramPlan;
      if (provider === "openai-compatible") {
        plan = await callOpenAiCompatible({
          prompt,
          history,
          apiKey: resolvedKey,
          baseUrl,
          model,
          signal: controller.signal,
        });
      } else if (provider === "anthropic") {
        plan = await callAnthropic({
          prompt,
          history,
          apiKey: resolvedKey,
          model,
          signal: controller.signal,
        });
      } else {
        plan = await callGemini({
          prompt,
          history,
          apiKey: resolvedKey,
          model,
          signal: controller.signal,
        });
      }

      if (!controller.signal.aborted) {
        res.json({ provider, mode: "byok", plan });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("AI diagram generation failed:", error);
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "AI provider failed to generate diagram.",
      });
    }
  } finally {
    req.off("close", handleClose);
  }
});
