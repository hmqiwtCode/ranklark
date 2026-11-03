import { isCountry } from "@ranklark/core/apple";
import { NextResponse } from "next/server";
import { refreshAppJob } from "@/features/keywords/server/refresh";
import { fetchMode } from "@/server/config";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const appId = Number((await params).id);
  const body = (await req.json().catch(() => ({}))) as { country?: string; popularity?: boolean };
  const country = isCountry(body.country) ? body.country : "us";
  if (fetchMode() === "extension") return NextResponse.json({ mode: "extension" });
  const job = refreshAppJob(appId, country, { popularity: body.popularity ?? false });
  return NextResponse.json({ jobId: job.id, total: job.total });
}
