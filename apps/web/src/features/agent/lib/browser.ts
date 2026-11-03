/**
 * Browser-only settings for the AI research agent (localStorage).
 *
 * Every access is wrapped in try/catch: storage can be missing or throw (private windows, blocked site data,
 * server rendering), and the pages must still work without it. The API key never leaves this browser except
 * in the KEY_HEADER of a key test or a run start.
 */
import {
  AGENT_MODELS,
  type AgentEffort,
  type AgentModelId,
  DEFAULT_CONFIG,
  isAgentEffort,
  isAgentModel,
  KEY_HEADER,
  LOCAL_KEYS,
} from "./contract";

type LocalKey = keyof typeof LOCAL_KEYS;

export function readLocal(key: LocalKey): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LOCAL_KEYS[key]);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it. */
export function writeLocal(key: LocalKey, value: string): boolean {
  try {
    window.localStorage.setItem(LOCAL_KEYS[key], value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: LocalKey): boolean {
  try {
    window.localStorage.removeItem(LOCAL_KEYS[key]);
    return true;
  } catch {
    return false;
  }
}

/** The saved Claude API key, trimmed, or null. */
export const savedKey = (): string | null => readLocal("apiKey")?.trim() || null;

export const savedModel = (): AgentModelId => {
  const v = readLocal("model");
  return isAgentModel(v) ? v : DEFAULT_CONFIG.model;
};

export const savedEffort = (): AgentEffort => {
  const v = readLocal("effort");
  return isAgentEffort(v) ? v : DEFAULT_CONFIG.effort;
};

/** Headers for a key test or run start: the key header only when a key is saved in this browser. */
export function keyHeaders(): Record<string, string> {
  const key = savedKey();
  return key ? { [KEY_HEADER]: key } : {};
}

/** "sk-ant-…abcd": enough to recognise a key without showing it. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 12) return "•".repeat(Math.max(4, k.length));
  const head = k.startsWith("sk-ant-") ? "sk-ant-" : k.slice(0, 4);
  return `${head}…${k.slice(-4)}`;
}

/** Display name for a model id. Unknown ids are shown as they are; the scripted test model is named plainly. */
export function modelLabel(id: string | null | undefined): string {
  if (!id) return "—";
  const m = AGENT_MODELS.find((x) => x.id === id) ?? AGENT_MODELS.find((x) => id.startsWith(`${x.id}-`));
  if (m) return m.label;
  if (isScriptedModel(id)) return "Scripted test model";
  if (/^claude-code/i.test(id)) return "Claude Code's model";
  return id;
}

/** The deterministic test model (RANKLARK_AGENT_SCRIPTED=1) reports itself as "scripted-test". */
export const isScriptedModel = (id: string | null | undefined) => !!id && /scripted/i.test(id);

/** The price entry for a model id, also matching dated ids ("claude-opus-5-5-20261001"). */
export function modelEntry(id: string | null | undefined) {
  if (!id) return null;
  return AGENT_MODELS.find((x) => x.id === id) ?? AGENT_MODELS.find((x) => id.startsWith(`${x.id}-`)) ?? null;
}
