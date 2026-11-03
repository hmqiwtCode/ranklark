import { NextResponse } from "next/server";
import { snapshotMetadata } from "@/features/apps/server/apps";
import { getApp } from "@/features/keywords/server/queries";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Manually set the fields the public store doesn't expose (subtitle, hidden keyword field). */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const app = getApp(id);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    subtitle?: string | null;
    keywords_field?: string | null;
    primary_country?: string;
  };
  const subtitle = body.subtitle === undefined ? app.subtitle : body.subtitle?.trim() || null;
  const kw = body.keywords_field === undefined ? app.keywords_field : body.keywords_field?.trim() || null;
  const subChanged = subtitle !== app.subtitle;
  const kwChanged = kw !== app.keywords_field;
  db.prepare(
    `UPDATE apps SET subtitle = ?, keywords_field = ?,
       subtitle_source = CASE WHEN ? THEN 'manual' ELSE subtitle_source END,
       keywords_source = CASE WHEN ? THEN 'manual' ELSE keywords_source END,
       primary_country = COALESCE(?, primary_country), updated_at = datetime('now') WHERE id = ?`,
  ).run(subtitle, kw, subChanged ? 1 : 0, kwChanged ? 1 : 0, body.primary_country ?? null, id);
  snapshotMetadata(id, body.primary_country ?? app.primary_country);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  db.prepare("DELETE FROM ranks WHERE app_id = ?").run(id);
  db.prepare("DELETE FROM apps WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
