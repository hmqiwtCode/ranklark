/**
 * The model behind the agent's judgment roles. `createClaudeLlm` calls the Claude API with structured outputs;
 * `llm-scripted.ts` is a deterministic stand-in for tests. The orchestrator only sees the AgentLlm interface.
 *
 * Key safety: the key lives only in the client instance for the run. It is never logged, stored or put in an
 * error message (errors are mapped to fixed text, and API messages are scrubbed of anything key-shaped).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AGENT_MODELS, type AgentEffort, type AgentModelId, type TokenUsage } from "../lib/contract";

export type LlmRole = "planner" | "analyst" | "checker" | "composer";

export type LlmCall<T> = {
  role: LlmRole;
  /** Stable per role, so it caches. */
  system: string;
  /** The run-specific payload (compact JSON of facts, findings, constraints). */
  user: string;
  schema: z.ZodType<T>;
  /** The structured data `user` was built from. Only the scripted test model reads it. */
  data?: unknown;
  signal?: AbortSignal;
};

export type LlmResult<T> = { output: T; thinking?: string; usage: TokenUsage; model: string };

export interface AgentLlm {
  /** Requested model id ("scripted-test" for the test model). */
  readonly model: string;
  call<T>(req: LlmCall<T>): Promise<LlmResult<T>>;
}

export type LlmErrorKind =
  | "auth"
  | "permission"
  | "not_found"
  | "billing"
  | "rate_limit"
  | "overloaded"
  | "connection"
  | "bad_request"
  | "aborted"
  | "refusal"
  | "max_tokens"
  | "invalid_output"
  | "api";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
  /** The run can't continue at all (bad key, no access to the model, cancelled). */
  get fatal() {
    return (
      this.kind === "auth" || this.kind === "permission" || this.kind === "not_found" || this.kind === "billing" || this.kind === "aborted"
    );
  }
}

/** Removes anything key-shaped from text that came back from the API. */
export function scrub(s: string, key?: string): string {
  let out = s.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[redacted]");
  if (key && key.length > 8) out = out.split(key).join("[redacted]");
  return out.slice(0, 300);
}

/** Maps SDK errors to clear, key-free messages. */
export function mapClaudeError(e: unknown, model: string, key?: string): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.APIUserAbortError || (e instanceof Error && e.name === "AbortError"))
    return new LlmError("aborted", "Cancelled.");
  if (e instanceof Anthropic.AuthenticationError)
    return new LlmError("auth", "Claude rejected the API key (401). Check or replace it in Settings.");
  if (e instanceof Anthropic.PermissionDeniedError)
    return new LlmError("permission", `This API key isn't allowed to use ${model} (403): ${scrub(e.message, key)}`);
  if (e instanceof Anthropic.NotFoundError)
    return new LlmError("not_found", `${model} isn't available to this API key (404). Pick another model in Settings.`);
  if (e instanceof Anthropic.RateLimitError)
    return new LlmError(
      "rate_limit",
      "Claude's rate limit was reached (429), even after retrying. Wait a minute or choose a smaller model.",
    );
  if (e instanceof Anthropic.APIConnectionError)
    return new LlmError("connection", "Couldn't reach the Claude API (network error or timeout).");
  if (e instanceof Anthropic.BadRequestError)
    return new LlmError("bad_request", `The Claude API rejected the request (400): ${scrub(e.message, key)}`);
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402)
      return new LlmError("billing", "The Anthropic account has a billing problem (402). Check your plan or credits in the Console.");
    if (e.status === 529 || e.status === 503)
      return new LlmError("overloaded", `The Claude API is overloaded (${e.status}). Try again shortly.`);
    return new LlmError("api", `Claude API error${e.status ? ` (${e.status})` : ""}: ${scrub(e.message, key)}`);
  }
  if (e instanceof Anthropic.AnthropicError) return new LlmError("api", `Claude API error: ${scrub(e.message, key)}`);
  return new LlmError("api", scrub(e instanceof Error ? e.message : String(e), key));
}

export type ClaudeLlmOptions = { apiKey: string; model: AgentModelId; effort: AgentEffort };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function createClaudeLlm({ apiKey, model, effort }: ClaudeLlmOptions): AgentLlm {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const fallbacks = AGENT_MODELS.find((m) => m.id === model)?.fallbacks === true;

  return {
    model,
    async call<T>(req: LlmCall<T>): Promise<LlmResult<T>> {
      // `.parse()` parses inside its promise, which would throw on a refused or truncated answer before we can read
      // stop_reason. Wrapping the format's parse keeps the SDK path but defers the verdict until after that check.
      const format = betaZodOutputFormat(req.schema);
      const safeFormat = {
        ...format,
        parse: (content: string): Parsed<T> => {
          try {
            return { ok: true, value: format.parse(content) as T };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        },
      };
      const send = () =>
        client.beta.messages.parse(
          {
            model,
            max_tokens: 16000,
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort, format: safeFormat },
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: req.user }],
            // server-side fallback when the model declines (not offered for Haiku 5.5)
            ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
          },
          { signal: req.signal },
        );
      let r: Awaited<ReturnType<typeof send>>;
      try {
        r = await send();
      } catch (e) {
        throw mapClaudeError(e, model, apiKey);
      }
      if (r.stop_reason === "refusal") {
        const cat = r.stop_details?.category;
        throw new LlmError("refusal", `Claude declined the ${req.role} step${cat ? ` (category: ${cat})` : ""}.`);
      }
      if (r.stop_reason === "max_tokens")
        throw new LlmError("max_tokens", `Claude's ${req.role} answer was cut off at the 16,000-token limit.`);
      const parsed = r.parsed_output;
      if (!parsed) throw new LlmError("invalid_output", `Claude returned no structured ${req.role} answer.`);
      if (!parsed.ok)
        throw new LlmError("invalid_output", `Claude's ${req.role} answer didn't match the expected shape: ${scrub(parsed.error, apiKey)}`);
      const thinking = r.content.flatMap((b) => (b.type === "thinking" && b.thinking ? [b.thinking] : [])).join("\n\n");
      return {
        output: parsed.value,
        thinking: thinking || undefined,
        usage: {
          input: r.usage.input_tokens ?? 0,
          output: r.usage.output_tokens ?? 0,
          cacheRead: r.usage.cache_read_input_tokens ?? 0,
          cacheWrite: r.usage.cache_creation_input_tokens ?? 0,
        },
        model: r.model,
      };
    },
  };
}

/** Cheap key check: retrieving a model spends no tokens. */
export async function checkClaudeKey(
  apiKey: string,
  model: AgentModelId,
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15_000 });
    const info = await client.models.retrieve(model);
    return { ok: true, model: info.id };
  } catch (e) {
    return { ok: false, error: mapClaudeError(e, model, apiKey).message };
  }
}
