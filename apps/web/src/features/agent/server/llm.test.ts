import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmError, mapClaudeError, scrub } from "./llm";
import { scriptedMode } from "./llm-scripted";

const KEY = "sk-ant-api03-SECRETSECRETSECRET-abcdef";

describe("Claude error mapping", () => {
  it("never leaks the key", () => {
    expect(scrub(`bad key ${KEY} here`, KEY)).toBe("bad key [redacted] here");
    expect(scrub("custom-key-1234567890", "custom-key-1234567890")).toBe("[redacted]");
    const e = mapClaudeError(new Error(`boom ${KEY}`), "claude-opus-5-5", KEY);
    expect(e.message).not.toContain("SECRET");
  });

  it("maps typed SDK errors to clear messages", () => {
    const headers = new Headers();
    const auth = mapClaudeError(new Anthropic.AuthenticationError(401, { error: { message: KEY } }, KEY, headers), "claude-opus-5-5", KEY);
    expect(auth).toMatchObject({ kind: "auth", fatal: true });
    expect(auth.message).toContain("401");
    expect(auth.message).not.toContain("SECRET");
    expect(mapClaudeError(new Anthropic.NotFoundError(404, {}, "nf", headers), "claude-haiku-5-5")).toMatchObject({
      kind: "not_found",
      fatal: true,
    });
    expect(mapClaudeError(new Anthropic.RateLimitError(429, {}, "rl", headers), "m")).toMatchObject({ kind: "rate_limit", fatal: false });
    expect(mapClaudeError(new Anthropic.APIConnectionError({ message: "x" }), "m")).toMatchObject({ kind: "connection", fatal: false });
    expect(mapClaudeError(new Anthropic.APIUserAbortError(), "m")).toMatchObject({ kind: "aborted", fatal: true });
    expect(new LlmError("refusal", "declined").fatal).toBe(false);
  });
});

describe("scripted mode", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is opt-in and refused in production unless explicitly allowed", () => {
    vi.stubEnv("RANKLARK_AGENT_SCRIPTED", "");
    expect(scriptedMode()).toBe(false);
    vi.stubEnv("RANKLARK_AGENT_SCRIPTED", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(scriptedMode()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(scriptedMode()).toBe(false);
    vi.stubEnv("RANKLARK_AGENT_SCRIPTED_ALLOW_PRODUCTION", "1");
    expect(scriptedMode()).toBe(true);
  });
});
