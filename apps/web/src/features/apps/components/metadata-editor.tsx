"use client";

import { audit, keywordFieldTokens, placement, utf8Bytes } from "@ranklark/core/metadata";
import { AlertTriangle, CheckCircle2, Cloud, Info, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { L } from "@/components/help";

function Counter({ used, limit }: { used: number; limit: number }) {
  const over = used > limit;
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: over ? "var(--color-bad)" : pct > 85 ? "var(--color-good)" : "var(--color-sky)" }}
        />
      </div>
      <span className={`tabular text-xs ${over ? "text-bad" : "text-ink-3"}`}>
        {used}/{limit}
      </span>
    </div>
  );
}

const ICON = { error: XCircle, warn: AlertTriangle, info: Info } as const;
const TONE = { error: "text-bad", warn: "text-warn", info: "text-sky" } as const;

export function MetadataEditor({
  appId,
  name,
  subtitle,
  keywords,
  keywordsSource,
  seller,
  tracked,
  ascEnabled,
}: {
  appId: number;
  name: string;
  subtitle: string | null;
  keywords: string | null;
  keywordsSource: string | null;
  seller: string | null;
  tracked: string[];
  ascEnabled: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ name, subtitle: subtitle ?? "", keywords: keywords ?? "" });
  const [busy, setBusy] = useState<"save" | "asc" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fields = { name: draft.name, subtitle: draft.subtitle || null, keywords: draft.keywords || null, seller };
  const result = audit(fields, tracked);
  const coverage = tracked.map((t) => ({ t, p: placement(t, fields) }));
  const covered = coverage.filter((c) => c.p.covered).length;
  const dirty = draft.subtitle !== (subtitle ?? "") || draft.keywords !== (keywords ?? "");
  const bytes = utf8Bytes(draft.keywords);

  const save = async () => {
    setBusy("save");
    await fetch(`/api/apps/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitle: draft.subtitle, keywords_field: draft.keywords }),
    });
    setBusy(null);
    setMsg("Saved. A metadata marker will appear on the rank chart.");
    router.refresh();
  };
  const syncAsc = async () => {
    setBusy("asc");
    const r = await fetch("/api/asc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId }) });
    const j = await r.json();
    setBusy(null);
    setMsg(r.ok ? `Pulled ${j.locales} localizations from App Store Connect.` : j.error);
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <section className="card p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Your App Store text</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Apple only searches these three fields. Try wording here and watch the coverage on the right update.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {ascEnabled && (
              <button onClick={syncAsc} disabled={!!busy} className="btn-ghost flex h-8 items-center gap-1.5 px-3 text-xs">
                {busy === "asc" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />} Pull from App Store
                Connect
              </button>
            )}
            <button onClick={save} disabled={!dirty || !!busy} className="btn-primary h-8 px-3 text-xs">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <label className="mb-1 flex items-center justify-between text-[13px] text-ink-2">
          <L term="appName">App name</L> <Counter used={[...draft.name].length} limit={30} />
        </label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="field mb-1 h-10 w-full px-3 text-sm"
        />
        <p className="mb-4 text-[11px] text-ink-3">From the App Store. Changing it here is only for trying ideas; it isn't saved.</p>

        <label className="mb-1 flex items-center justify-between text-[13px] text-ink-2">
          <L term="subtitle">Subtitle</L> <Counter used={[...draft.subtitle].length} limit={30} />
        </label>
        <input
          value={draft.subtitle}
          onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          placeholder="Not public in Apple's Lookup API — paste it or pull from ASC"
          className="field mb-4 h-10 w-full px-3 text-sm"
        />

        <label className="mb-1 flex items-center justify-between text-[13px] text-ink-2">
          <span className="inline-flex items-center">
            <L term="keywordField">Keyword field</L>{" "}
            {keywordsSource && <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-3">({keywordsSource})</span>}
          </span>
          <span className="flex items-center gap-3">
            {bytes !== [...draft.keywords].length && <span className="text-[11px] text-ink-3">{bytes} bytes</span>}
            <Counter used={[...draft.keywords].length} limit={100} />
          </span>
        </label>
        <textarea
          value={draft.keywords}
          onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
          rows={3}
          placeholder="comma,separated,no,spaces — hidden from the public store"
          className="field w-full resize-none px-3 py-2 font-mono text-[13px] leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {keywordFieldTokens(draft.keywords).map((t, i) => (
            <span key={t + i} className="rounded-md bg-good/10 px-1.5 py-0.5 text-[11px] text-good">
              {t}
            </span>
          ))}
        </div>
        {msg && <p className="mt-3 text-xs text-ink-2">{msg}</p>}
      </section>

      <div className="flex flex-col gap-4">
        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-semibold">
            <L term="audit">Audit</L>
          </h2>
          {result.issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-good">
              <CheckCircle2 className="h-4 w-4" />
              No issues found.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {result.issues.map((i, k) => {
                const I = ICON[i.level];
                return (
                  <li key={k} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                    <I className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[i.level]}`} />
                    <span>
                      {i.message}{" "}
                      <span className="text-[10px] uppercase tracking-wide text-ink-3">
                        {i.basis === "apple" ? "Apple rule" : "observed"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              <L term="coverage">Tracked keyword coverage</L>
            </h2>
            <span className="tabular text-sm text-ink-2">
              {covered}/{tracked.length}
            </span>
          </div>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {coverage.map(({ t, p }) => (
              <div key={t} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-white/[0.03]">
                <span className={p.covered ? "text-ink" : "text-ink-3"}>{t}</span>
                <span className="text-[11px]">
                  {p.covered ? (
                    <span className="text-good">
                      {p.where.map((w) => ({ T: "Name", S: "Subtitle", K: "Keywords", D: "Developer" })[w] ?? w).join(" + ")}
                    </span>
                  ) : (
                    <span className="text-warn">missing: {p.missing.join(", ")}</span>
                  )}
                </span>
              </div>
            ))}
            {!tracked.length && <p className="text-sm text-ink-3">Track some keywords first.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
