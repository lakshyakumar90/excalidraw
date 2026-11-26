#!/usr/bin/env node
/**
 * Zero-dependency local CLI bridge for Chitran.
 * Allows https://excalidraw.lakshyakumar.in (or localhost) to execute locally
 * installed `opencode`, `codex`, or `agy` CLIs using your local machine's logins.
 *
 * Usage: node scripts/local-cli-bridge.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CHITRAN_CLI_BRIDGE_PORT || 4319);
const HOST = "127.0.0.1";

const SYSTEM_PROMPT = `You are a system architecture diagram planner.
Return ONLY valid JSON matching:
{"summary":"short title","steps":[{"title":"Step 1: ...","mermaidChunk":"graph TD\\n  A[Node] --> B[Node]"}]}
Break the diagram into 2 to 4 topological build steps (Step 1: Entry/Clients, Step 2: Core Services, Step 3: Storage/Async). Every mermaidChunk must be valid Mermaid flowchart syntax (graph TD or graph LR). Do not include markdown fences or commentary outside the JSON object.`;

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  if (origin) res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function extractJsonObject(raw) {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("CLI response did not contain a valid JSON object.");
  }
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  if (!parsed || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("CLI JSON is missing a non-empty 'steps' array.");
  }
  return parsed;
}

function killProcessTree(child) {
  if (!child || child.killed || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
}

function execProcess({ command, args, cwd, stdinText, shell = false, timeoutMs = 90_000, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request cancelled."));
      return;
    }

    const child = spawn(command, args, {
      cwd,
      shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      reject(new Error("Request cancelled."));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
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
        const detail = (stderr || stdout).trim().slice(0, 350);
        reject(new Error(detail || `${command} exited with code ${code}.`));
        return;
      }
      resolve({ stdout, stderr });
    });

    if (stdinText !== undefined) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

async function runCli({ provider, prompt, history = [], model, signal }) {
  const historyBlock =
    Array.isArray(history) && history.length > 0
      ? `\n\nConversation context:\n${history
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")}`
      : "";
  const fullPrompt = `${SYSTEM_PROMPT}${historyBlock}\n\nUser request: ${prompt}`;
  const workDir = await mkdtemp(join(tmpdir(), "chitran-cli-"));

  try {
    if (provider === "codex-cli") {
      const outputName = "codex-last.txt";
      const outputFile = join(workDir, outputName);
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "-s",
        "read-only",
        "-o",
        outputName,
      ];
      if (model) args.push("-m", model);
      args.push("-");
      const { stdout } = await execProcess({
        command: "codex",
        args,
        cwd: workDir,
        stdinText: fullPrompt,
        shell: process.platform === "win32",
        signal,
      });
      const fileText = await readFile(outputFile, "utf8").catch(() => "");
      return extractJsonObject(fileText || stdout);
    }

    if (provider === "opencode") {
      const promptName = "prompt.txt";
      const promptFile = join(workDir, promptName);
      await writeFile(promptFile, fullPrompt, "utf8");
      const args = ["run", "--archived", "--format", "default", "--file", promptName];
      if (model) args.push("--model", model);
      args.push("Read the attached prompt.txt and return ONLY the JSON object.");
      const { stdout } = await execProcess({
        command: "opencode",
        args,
        cwd: workDir,
        shell: process.platform === "win32",
        signal,
      });
      return extractJsonObject(stdout);
    }

    if (provider === "antigravity-cli") {
      const args = ["-p", fullPrompt, "--output-format", "text"];
      if (model) args.push("--model", model);
      const { stdout } = await execProcess({
        command: "agy",
        args,
        cwd: workDir,
        shell: false,
        signal,
      });
      return extractJsonObject(stdout);
    }

    throw new Error(`Unsupported local CLI provider: ${provider}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok", service: "chitran-local-cli-bridge" });
    return;
  }

  if (req.method === "POST" && req.url === "/generate-diagram") {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString("utf8");
      if (raw.length > 1_000_000) {
        sendJson(res, 413, { error: "Request body too large." });
        return;
      }
    }

    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }

    const { prompt, provider, model, history } = body;
    if (typeof prompt !== "string" || prompt.trim().length < 2) {
      sendJson(res, 400, { error: "Prompt must be at least 2 characters." });
      return;
    }
    if (!["opencode", "codex-cli", "antigravity-cli"].includes(provider)) {
      sendJson(res, 400, { error: "Unsupported local CLI provider." });
      return;
    }

    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const plan = await runCli({
        provider,
        prompt: prompt.trim(),
        history,
        model: typeof model === "string" && model.trim() ? model.trim() : undefined,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        sendJson(res, 200, { provider, mode: "local-cli", plan });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const code = error && typeof error === "object" ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (code === "ENOENT" || /\bENOENT\b/i.test(message)) {
        sendJson(res, 404, {
          error: `${provider} CLI is not installed or not on PATH on this computer.`,
        });
        return;
      }
      sendJson(res, 502, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Chitran local CLI bridge listening on http://${HOST}:${PORT}`);
  console.log("Supports: OpenCode (opencode), Codex CLI (codex), AntiGravity CLI (agy)");
});
