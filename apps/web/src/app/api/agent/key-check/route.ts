import { NextResponse } from "next/server";
import { DEFAULT_CONFIG, isAgentModel, KEY_HEADER, type KeyCheckResult } from "@/features/agent/lib/contract";
import { checkClaudeKey } from "@/features/agent/server/llm";
import { SCRIPTED_MODEL, scriptedMode } from "@/features/agent/server/llm-scripted";
import { sameOrigin } from "@/features/agent/server/settings";

export const dynamic = "force-dynamic";

/** Tests the key in the header by retrieving the chosen model (spends no tokens). The key is never echoed. */
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ ok: false, error: "Cross-site request refused." } satisfies KeyCheckResult, { status: 403 });
  // the scripted test model needs no key, so a typed key is never sent anywhere
  if (scriptedMode()) return NextResponse.json({ ok: true, model: SCRIPTED_MODEL } satisfies KeyCheckResult);
  const key = req.headers.get(KEY_HEADER)?.trim() ?? "";
  if (!key) return NextResponse.json({ ok: false, error: "No API key provided." } satisfies KeyCheckResult, { status: 400 });
  if (key.length > 300 || /\s/.test(key))
    return NextResponse.json({ ok: false, error: "That doesn't look like a Claude API key." } satisfies KeyCheckResult, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const model = isAgentModel(body.model) ? body.model : DEFAULT_CONFIG.model;
  const result: KeyCheckResult = await checkClaudeKey(key, model);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
