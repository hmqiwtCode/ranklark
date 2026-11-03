"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import { Check, Loader2, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JobBar, useJob } from "@/components/actions";
import { extSend } from "@/features/extension/messaging";

/**
 * First thing a new app needs: keywords. One clear question, one input, and one-click suggestions
 * taken from the app's own name and subtitle.
 */
export function KeywordOnboarding({
  appId,
  appName,
  country,
  suggestions,
}: {
  appId: number;
  appName: string;
  country: string;
  suggestions: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(suggestions.slice(0, 3)));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { job, track } = useJob();
  const sf = STOREFRONTS[country];

  const terms = [...picked, ...typed.split(",").map((t) => t.trim())].filter(Boolean);

  const toggle = (t: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms.length) return setErr("Type at least one keyword, or pick a suggestion.");
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/apps/${appId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms, country }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Couldn't add them.");
    if (j.jobId) track(j.jobId);
    else await extSend({ type: "run" });
    router.refresh();
  };

  return (
    <section className="card mt-4 p-6 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step 2 of 2</p>
        <h2 className="mt-1 text-[24px] font-bold tracking-tight">Which searches should {appName} show up for?</h2>
        <p className="mt-1 text-[15px] text-ink-2">
          Add the words people type into the App Store {sf ? `in ${sf.flag} ${sf.name}` : ""}. We find where you rank for each one, usually
          within a minute.
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {suggestions.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[13px] text-ink-3">
                <Sparkles className="h-3.5 w-3.5" /> Ideas from your app's name and subtitle (tap to pick)
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggle(t)}
                    aria-pressed={picked.has(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition ${
                      picked.has(t) ? "border-primary bg-primary/15 text-ink" : "border-line-strong text-ink-2 hover:text-ink"
                    }`}
                  >
                    {picked.has(t) && <Check className="h-3.5 w-3.5 text-primary" />}
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-ink-3">Your own keywords, separated by commas</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="e.g. water reminder, drink water, hydration tracker"
              className="field h-12 px-4 text-[15px]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy || !terms.length} className="btn-primary flex h-11 items-center gap-2 px-5 text-[15px]">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Track {terms.length || ""} keyword{terms.length === 1 ? "" : "s"}
            </button>
            <Link
              href={`/research?app=${appId}&country=${country}${suggestions[0] ? `&seed=${encodeURIComponent(suggestions[0])}` : ""}`}
              className="inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink"
            >
              <Search className="h-4 w-4" /> Not sure? Find keyword ideas
            </Link>
            <JobBar job={job} />
          </div>
          {err && <p className="text-sm text-bad">{err}</p>}
        </form>
      </div>
    </section>
  );
}
