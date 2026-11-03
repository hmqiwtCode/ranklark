"use client";

import { STOREFRONTS } from "@ranklark/core/apple";
import { ArrowRight, Cloud, Loader2, Plus, RefreshCw, Smartphone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { extSend } from "@/features/extension/messaging";

type Job = { id: string; total: number; done: number; errors: string[]; finished: boolean; label: string };

/** Poll a background job until it finishes, then refresh server components. */
export function useJob() {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const track = useCallback(
    (id: string) => {
      const tick = async () => {
        const j = (await fetch(`/api/jobs/${id}`).then((r) => r.json())) as Job & { missing?: boolean };
        if (j.missing) return setJob(null);
        setJob(j);
        if (j.done > 0 && j.done % 3 === 0) router.refresh();
        if (j.finished) {
          router.refresh();
          setTimeout(() => setJob(null), 2500);
        } else setTimeout(tick, 1500);
      };
      tick();
    },
    [router],
  );
  return { job, track };
}

export function JobBar({ job }: { job: Job | null }) {
  if (!job) return null;
  const pct = Math.round((job.done / Math.max(job.total, 1)) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-ink-2">
      {!job.finished ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-good">✓</span>}
      <span>{job.finished ? "Done" : job.label}</span>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular">
        {job.done}/{job.total}
      </span>
      {job.errors.length > 0 && (
        <span className="text-warn" title={job.errors.join("\n")}>
          {job.errors.length} failed
        </span>
      )}
    </div>
  );
}

export function AddAppForm({ big = false }: { big?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [country, setCountry] = useState("us");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, country }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    router.push(`/apps/${j.id}?country=${j.country}`);
  };
  return (
    <form onSubmit={submit} className={`mx-auto flex w-full flex-col gap-2 ${big ? "max-w-md" : "max-w-lg"}`}>
      <div className="flex">
        <span className="field flex items-center rounded-r-none border-r-0 px-3 text-ink-3">
          <Smartphone className="h-4 w-4" />
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste your App Store link or app ID"
          className={`field min-w-0 flex-1 rounded-none px-3 ${big ? "h-12 text-[16px]" : "h-10 text-sm"}`}
          required
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={`field rounded-l-none border-l-0 px-2 text-sm ${big ? "h-12" : "h-10"}`}
          aria-label="Storefront"
        >
          {Object.entries(STOREFRONTS).map(([c, s]) => (
            <option key={c} value={c}>
              {s.flag} {c.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <button disabled={busy} className={`btn-primary flex items-center justify-center gap-2 ${big ? "h-12 text-[16px]" : "h-10 text-sm"}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Add my app <ArrowRight className="h-4 w-4" />
      </button>
      {err && <p className="text-center text-sm text-bad">{err}</p>}
    </form>
  );
}

export function ImportFromAsc({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!enabled) return null;
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy}
        className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await fetch("/api/asc", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          const j = await r.json();
          setBusy(false);
          setMsg(r.ok ? `Imported ${j.liveInStore} live apps · real keyword fields for ${j.synced}` : j.error);
          router.refresh();
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />} Import all from App Store Connect
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </div>
  );
}

export function CountrySelect({ value, options }: { value: string; options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const all = [...new Set([value, ...options, "us", "gb", "vn"])];
  return (
    <select
      value={value}
      aria-label="Storefront"
      className="btn-ghost h-9 cursor-pointer px-2 text-sm font-medium"
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        p.set("country", e.target.value);
        router.push(`${pathname}?${p}`);
      }}
    >
      {all
        .filter((c) => STOREFRONTS[c])
        .map((c) => (
          <option key={c} value={c}>
            {STOREFRONTS[c].flag} {STOREFRONTS[c].name}
          </option>
        ))}
      {Object.keys(STOREFRONTS)
        .filter((c) => !all.includes(c))
        .map((c) => (
          <option key={c} value={c}>
            {STOREFRONTS[c].flag} {STOREFRONTS[c].name}
          </option>
        ))}
    </select>
  );
}

export function RefreshButton({ appId, country, auto = false }: { appId: number; country: string; auto?: boolean }) {
  const { job, track } = useJob();
  const [note, setNote] = useState<string | null>(null);
  const run = useCallback(
    async (popularity: boolean) => {
      const r = await fetch(`/api/apps/${appId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, popularity }),
      });
      const j = await r.json();
      if (j.jobId) track(j.jobId);
      if (j.mode === "extension") {
        const ok = await extSend<{ ok: boolean }>({ type: "run" });
        setNote(
          ok?.ok
            ? "Your browser extension is checking now — results appear as they arrive."
            : "Open the Extension page to install/connect the browser extension.",
        );
      }
    },
    [appId, country, track],
  );
  useEffect(() => {
    if (auto) run(false);
  }, [auto, run]);
  return (
    <div className="flex items-center gap-3">
      {note && <span className="max-w-64 text-xs text-ink-3">{note}</span>}
      <JobBar job={job} />
      <button
        title="Re-check ranks now (≈3s per keyword — Apple allows ~20 searches/min)"
        disabled={!!job && !job.finished}
        onClick={() => run(false)}
        className="btn-ghost grid h-9 w-9 place-items-center"
      >
        <RefreshCw className={`h-4 w-4 ${job && !job.finished ? "animate-spin" : ""}`} />
      </button>
      <button
        title="Re-check ranks + popularity"
        disabled={!!job && !job.finished}
        onClick={() => run(true)}
        className="btn-ghost h-9 px-3 text-sm"
      >
        Full refresh
      </button>
    </div>
  );
}

export function AddKeywords({ appId, country }: { appId: number; country: string }) {
  const [v, setV] = useState("");
  const { job, track } = useJob();
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch(`/api/apps/${appId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms: v, country }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setV("");
    if (j.jobId) track(j.jobId);
    else if (j.mode === "extension") {
      const ok = await extSend<{ ok: boolean }>({ type: "run" });
      setErr(ok?.ok ? null : "Saved. Connect the browser extension (Extension page) to check them.");
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-1 flex-wrap items-center gap-3">
      <div className="flex min-w-60 flex-1 items-center gap-2">
        <Plus className="h-4 w-4 text-ink-3" />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Add keyword(s), comma separated…"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
      </div>
      <JobBar job={job} />
      {err && <span className="text-xs text-bad">{err}</span>}
    </form>
  );
}
