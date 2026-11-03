import { isCountry } from "@ranklark/core/apple";
import { normalize } from "@ranklark/core/metadata";
import { NextResponse } from "next/server";
import { ensureShowcase, readShowcase } from "@/features/showcase/server/showcase";

export const dynamic = "force-dynamic";

/** Returns cached live data for a seed; starts a (re)build when missing or older than 3 days. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const seed = normalize(url.searchParams.get("seed") ?? "");
  const country = isCountry(url.searchParams.get("country")) ? url.searchParams.get("country")! : "us";
  if (seed.length < 2 || seed.length > 40) return NextResponse.json({ error: "Keyword must be 2–40 characters." }, { status: 400 });
  const { data, stale } = readShowcase(seed, country);
  const job = stale ? ensureShowcase(seed, country) : null;
  return NextResponse.json({ data, job: job ? { id: job.id, done: job.done, total: job.total, finished: job.finished } : null });
}
