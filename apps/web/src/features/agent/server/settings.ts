/**
 * Server-side agent settings: which Claude credentials a run may use, and the MCP endpoint's bearer token
 * (stored only as a SHA-256 hash plus its last 4 characters, in the settings table).
 */
import crypto from "node:crypto";
import { fetchMode } from "@/server/config";
import { getSetting, setSetting } from "@/server/db";
import { type AgentConfig, type AgentStatus, KEY_HEADER, type McpSettings } from "../lib/contract";
import { type AgentLlm, createClaudeLlm } from "./llm";
import { createScriptedLlm, scriptedMode } from "./llm-scripted";

// ------------------------------------------------------------------ Claude credentials

/** Server credentials (ANTHROPIC_API_KEY) are only for single-user self-hosting (server fetch mode). */
const serverKey = () => (fetchMode() === "server" ? process.env.ANTHROPIC_API_KEY?.trim() || null : null);

export const serverCredentialsAllowed = () => fetchMode() === "server" && (!!serverKey() || scriptedMode());

/** The model client for a run: the scripted test model, the browser's key, or (server mode only) the server's key. */
export function llmForRequest(req: Request, config: AgentConfig): { llm: AgentLlm } | { error: string; status: number } {
  if (scriptedMode()) return { llm: createScriptedLlm() };
  const key = req.headers.get(KEY_HEADER)?.trim() || serverKey();
  if (!key) {
    return {
      error:
        fetchMode() === "extension"
          ? "Add your Claude API key in Settings. This server is shared, so every browser brings its own key."
          : "Add your Claude API key in Settings (it stays in this browser), or set ANTHROPIC_API_KEY on the server.",
      status: 400,
    };
  }
  if (key.length > 300 || /\s/.test(key)) return { error: "That doesn't look like a Claude API key.", status: 400 };
  return { llm: createClaudeLlm({ apiKey: key, model: config.model, effort: config.effort }) };
}

// ------------------------------------------------------------------ MCP token

const MCP_ENABLED = "mcp.enabled";
const MCP_HASH = "mcp.token_hash";
const MCP_HINT = "mcp.token_hint";
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Endpoint URL as this request reached the server. */
export function mcpUrl(req: Request): string {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto = (req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}/api/mcp`;
}

export function mcpSettings(req: Request): McpSettings {
  return { enabled: getSetting(MCP_ENABLED) === "1" && !!getSetting(MCP_HASH), tokenHint: getSetting(MCP_HINT), url: mcpUrl(req) };
}

/** Enables MCP with a fresh token (any previous token stops working). The token is returned only here. */
export function rotateMcpToken(req: Request): McpSettings {
  const token = `rlm_${crypto.randomBytes(24).toString("base64url")}`;
  setSetting(MCP_HASH, sha256(token));
  setSetting(MCP_HINT, token.slice(-4));
  setSetting(MCP_ENABLED, "1");
  return { ...mcpSettings(req), token };
}

export function disableMcp(req: Request): McpSettings {
  setSetting(MCP_ENABLED, null);
  setSetting(MCP_HASH, null);
  setSetting(MCP_HINT, null);
  return mcpSettings(req);
}

/** 401 when the bearer token is missing or wrong, 403 when MCP is disabled; null when the caller may proceed. */
export function checkMcpAuth(req: Request): { status: 401 | 403; error: string } | null {
  const stored = getSetting(MCP_HASH);
  if (getSetting(MCP_ENABLED) !== "1" || !stored) return { status: 403, error: "MCP is disabled. Enable it in Ranklark Settings." };
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!given || given.length > 200) return { status: 401, error: "Missing or invalid bearer token." };
  const a = Buffer.from(sha256(given), "hex");
  const b = Buffer.from(stored, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { status: 401, error: "Missing or invalid bearer token." };
  return null;
}

// ------------------------------------------------------------------ status

export function agentStatus(req: Request): AgentStatus {
  return { serverCredentials: serverCredentialsAllowed(), fetchMode: fetchMode(), mcp: mcpSettings(req), scripted: scriptedMode() };
}

/**
 * Cross-site request guard for state-changing routes: browsers always send Origin on cross-origin POST/DELETE,
 * so a present Origin must match the host the request was sent to.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
