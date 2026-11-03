import { NextResponse } from "next/server";
import { extOverview } from "@/features/extension/server/overview";
import { fetchMode } from "@/server/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ mode: fetchMode(), ...extOverview() });
}
