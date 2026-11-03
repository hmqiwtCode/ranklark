import { NextResponse } from "next/server";
import { type StartRunResult, sanitizeConfig } from "@/features/agent/lib/contract";
import { startRun } from "@/features/agent/server/orchestrator";
import { parseAgentInput } from "@/features/agent/server/run-input";
import { llmForRequest, sameOrigin } from "@/features/agent/server/settings";
import { listRuns } from "@/features/agent/server/store";

export const dynamic = "force-dynamic";

/** Run history, newest first. */
export function GET() {
  return NextResponse.json(listRuns(50));
}

/** Starts a run ({ input, config }; the browser's key in the x-anthropic-api-key header) → { runId }. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." } satisfies StartRunResult, { status: 403 });
  const body = (await req.json().catch(() => null)) as { input?: unknown; config?: Record<string, unknown> } | null;
  if (!body) return NextResponse.json({ error: "Send JSON: { input, config }." } satisfies StartRunResult, { status: 400 });
  const parsed = parseAgentInput(body.input);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error } satisfies StartRunResult, { status: 400 });
  const config = sanitizeConfig(body.config);
  const model = llmForRequest(req, config);
  if ("error" in model) return NextResponse.json({ error: model.error } satisfies StartRunResult, { status: model.status });
  const runId = startRun({ input: parsed.input, config, llm: model.llm, source: "api" });
  return NextResponse.json({ runId } satisfies StartRunResult);
}
