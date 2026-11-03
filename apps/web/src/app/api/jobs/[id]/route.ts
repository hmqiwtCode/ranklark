import { NextResponse } from "next/server";
import { getJob } from "@/server/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return NextResponse.json({ finished: true, missing: true });
  return NextResponse.json(job);
}
