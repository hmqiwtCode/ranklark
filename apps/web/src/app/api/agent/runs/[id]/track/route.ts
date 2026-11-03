import { NextResponse } from "next/server";
import { sameOrigin } from "@/features/agent/server/settings";
import { trackRecommendation } from "@/features/agent/server/track";

export const dynamic = "force-dynamic";

/** Tracks the run's recommended keywords (optionally a subset: { terms }) for the run's app. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { terms?: unknown };
  const r = await trackRecommendation((await params).id, body.terms);
  return "error" in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
}
