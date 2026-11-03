"use client";

import { PACING, STOREFRONTS } from "@ranklark/core/apple";
import { ArrowRight, ChevronDown, KeyRound, Lightbulb, Link2, Loader2, Smartphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { L } from "@/components/help";
import { AppIcon } from "@/components/ui";
import { keyHeaders, modelLabel, savedEffort, savedKey, savedModel } from "../lib/browser";
import {
  type AgentEffort,
  type AgentGoal,
  type AgentModelId,
  CONFIG_LIMITS,
  DEFAULT_CONFIG,
  type StartRunBody,
  type StartRunResult,
} from "../lib/contract";
import { useAgentStatus } from "./use-status";

export type AppOption = { id: number; name: string; icon: string | null; country: string };
type Mode = "mine" | "link" | "idea";

/** Reads an App Store link ("…/us/app/name/id123456789") or a bare numeric ID. */
export function parseAppRef(s: string): { id: number | null; country: string | null } {
  const t = s.trim();
  const m = t.match(/\bid(\d{6,12})\b/i) ?? t.match(/^(\d{6,12})$/);
  const cc = t.match(/apps\.apple\.com\/([a-z]{2})\//i)?.[1]?.toLowerCase();
  return { id: m ? Number(m[1]) : null, country: cc && STOREFRONTS[cc] ? cc : null };
}

const fmtMin = (ms: number) => {
  const m = ms / 60_000;
  return m < 1 ? "<1" : String(Math.round(m));
};

/** Rough Apple time for a whole budget, from the deliberate per-host spacing in PACING (no model time). */
function appleTime(budget: number) {
  const gaps = Object.values(PACING);
  const perSecond = gaps.reduce((s, g) => s + 1000 / g, 0); // all hosts busy in parallel
  return { lo: (budget / perSecond) * 1000, hi: budget * Math.max(...gaps), minGap: Math.min(...gaps), maxGap: Math.max(...gaps) };
}

function NumberField({
  label,
  term,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  term: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  hint: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    onChange(v);
    setText(String(v));
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] text-ink-2">
        <L term={term}>{label}</L>
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        className="field h-10 px-3 text-sm tabular"
      />
      <span className="text-[11.5px] text-ink-3">{hint}</span>
    </label>
  );
}

export function StartForm({ apps, initialApp }: { apps: AppOption[]; initialApp: number | null }) {
  const router = useRouter();
  const { status } = useAgentStatus();
  const firstApp = apps.find((a) => a.id === initialApp) ?? (apps.length === 1 ? apps[0] : null);
  const [mode, setMode] = useState<Mode>(apps.length ? "mine" : "link");
  const [appId, setAppId] = useState<number | null>(firstApp?.id ?? null);
  const [link, setLink] = useState("");
  const [idea, setIdea] = useState("");
  const [country, setCountry] = useState(firstApp?.country ?? "us");
  const [goal, setGoal] = useState<AgentGoal>("improve");
  const [goalTouched, setGoalTouched] = useState(false);
  const [seeds, setSeeds] = useState("");
  const [keepBrand, setKeepBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [maxIterations, setMaxIterations] = useState(DEFAULT_CONFIG.maxIterations);
  const [appleBudget, setAppleBudget] = useState(DEFAULT_CONFIG.appleBudget);
  const [maxKeywords, setMaxKeywords] = useState(DEFAULT_CONFIG.maxKeywords);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Browser settings are read after mount: localStorage doesn't exist during server rendering.
  const [local, setLocal] = useState<{ hasKey: boolean; model: AgentModelId; effort: AgentEffort } | null>(null);
  useEffect(() => setLocal({ hasKey: !!savedKey(), model: savedModel(), effort: savedEffort() }), []);

  // Goal follows the subject until the person picks one themselves.
  useEffect(() => {
    if (!goalTouched) setGoal(mode === "idea" ? "new_app" : "improve");
  }, [mode, goalTouched]);

  // The scripted test model makes no Claude calls, so a key is optional then.
  const needsKey = !!local && !local.hasKey && !!status && !status.serverCredentials && !status.scripted;
  const t = appleTime(appleBudget);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let id: number | null = null;
    if (mode === "mine") {
      if (!appId) return setErr("Pick one of your apps first.");
      id = appId;
    } else if (mode === "link") {
      id = parseAppRef(link).id;
      if (!id) return setErr("Paste an App Store link (…/id123456789) or just the app's number.");
    } else if (idea.trim().length < 8) {
      return setErr("Describe your idea in a sentence or two, so Claude knows what to research.");
    }
    if (needsKey) return setErr("Add your Claude API key in Settings first.");
    const body: StartRunBody = {
      input: {
        appId: id,
        country,
        idea: mode === "idea" ? idea.trim() : "",
        seeds: [
          ...new Set(
            seeds
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          ),
        ].slice(0, 20),
        goal,
        keepBrand: keepBrand.trim(),
        notes: notes.trim(),
      },
      config: {
        model: local?.model ?? DEFAULT_CONFIG.model,
        effort: local?.effort ?? DEFAULT_CONFIG.effort,
        maxIterations,
        appleBudget,
        maxKeywords,
      },
    };
    setBusy(true);
    try {
      const r = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders() },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => null)) as StartRunResult | null;
      if (r.ok && j && "runId" in j) {
        router.push(`/agent/${encodeURIComponent(j.runId)}`);
        return;
      }
      setErr(
        j && "error" in j && j.error
          ? j.error
          : r.status === 404
            ? "The AI research API isn't available on this server."
            : `Couldn't start the run (the server answered ${r.status}).`,
      );
    } catch {
      setErr("Couldn't reach the server.");
    }
    setBusy(false);
  };

  const modes: { key: Mode; label: string; icon: typeof Smartphone; show: boolean }[] = [
    { key: "mine", label: "One of my apps", icon: Smartphone, show: apps.length > 0 },
    { key: "link", label: "App Store link", icon: Link2, show: true },
    { key: "idea", label: "I don't have an app yet", icon: Lightbulb, show: true },
  ];

  return (
    <form onSubmit={submit} className="card flex flex-col" noValidate>
      {status?.scripted && (
        <p className="border-b border-line/70 bg-warn/[0.06] px-4 py-2.5 text-[13px] text-warn">
          <span className="font-semibold">Scripted test model (no Claude calls).</span> This server runs with RANKLARK_AGENT_SCRIPTED=1, so
          runs use a built-in test model instead of Claude. Apple data is real; the AI steps are canned. A browser key is optional and isn't
          used.
        </p>
      )}
      {status?.fetchMode === "extension" && (
        <p className="border-b border-line/70 bg-warn/[0.06] px-4 py-2.5 text-[13px] text-warn">
          This server is in extension mode, so it never calls Apple itself. The agent can only use Apple data Ranklark has already saved;
          anything else will fail with “waiting for the extension”.
        </p>
      )}

      <div className="flex flex-col gap-3 px-4 pt-4">
        <h2 className="text-[15px] font-semibold">What should Claude research?</h2>
        <div className="seg flex-wrap self-start">
          {modes
            .filter((m) => m.show)
            .map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                data-active={mode === m.key}
                onClick={() => setMode(m.key)}
                className="inline-flex items-center gap-1.5"
              >
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            ))}
        </div>

        {mode === "mine" && (
          <div className="grid max-h-[232px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={appId === a.id}
                onClick={() => {
                  setAppId(a.id);
                  setCountry(a.country);
                }}
                className={`flex min-w-0 items-center gap-2.5 rounded-lg border p-2 text-left transition ${appId === a.id ? "border-primary/70 bg-primary/[0.07]" : "border-line bg-well hover:border-line-strong"}`}
              >
                <AppIcon src={a.icon} name={a.name} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{a.name}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {STOREFRONTS[a.country]?.flag} {STOREFRONTS[a.country]?.name ?? a.country.toUpperCase()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "link" && (
          <label className="flex flex-col gap-1">
            <span className="sr-only">App Store link or app ID</span>
            <input
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                const cc = parseAppRef(e.target.value).country;
                if (cc) setCountry(cc);
              }}
              placeholder="https://apps.apple.com/us/app/…/id123456789 or 123456789"
              className="field h-11 px-3 text-[14px]"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-[12px] text-ink-3">Any app on the App Store works, not only yours. A competitor's link is fine too.</span>
          </label>
        )}

        {mode === "idea" && (
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-ink-2">Describe your app idea</span>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              maxLength={1200}
              required
              placeholder="e.g. A budgeting app for couples that splits shared expenses and shows who owes what each month."
              className="field resize-y px-3 py-2 text-[14px] leading-relaxed"
            />
            <span className="text-[12px] text-ink-3">Required. A sentence or two in your own words is enough.</span>
          </label>
        )}
      </div>

      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">
            <L term="store">Store</L>
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="field h-10 px-2 text-sm"
            aria-label="App Store country"
          >
            {Object.entries(STOREFRONTS).map(([c, s]) => (
              <option key={c} value={c}>
                {s.flag} {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2" id="goal-label">
            Goal
          </span>
          <div className="seg h-10 items-center self-start">
            {(
              [
                ["improve", "Improve a live app"],
                ["new_app", "Name a new app"],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                aria-pressed={goal === g}
                data-active={goal === g}
                onClick={() => {
                  setGoal(g);
                  setGoalTouched(true);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">Starting keywords (optional)</span>
          <input
            value={seeds}
            onChange={(e) => setSeeds(e.target.value)}
            placeholder="habit tracker, daily routine"
            className="field h-10 px-3 text-sm"
            autoComplete="off"
          />
          <span className="text-[11.5px] text-ink-3">Comma separated. Claude also finds its own.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">Brand word to keep (optional)</span>
          <input
            value={keepBrand}
            onChange={(e) => setKeepBrand(e.target.value)}
            placeholder="e.g. Fudget"
            maxLength={30}
            className="field h-10 px-3 text-sm"
          />
          <span className="text-[11.5px] text-ink-3">The recommended name will include it.</span>
        </label>
      </div>

      <label className="flex flex-col gap-1 px-4 pt-4">
        <span className="text-[13px] text-ink-2">Notes for Claude (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. No “AI” in the name. Aimed at students."
          className="field resize-y px-3 py-2 text-sm leading-relaxed"
        />
      </label>

      <details className="group mx-4 mt-4 rounded-lg border border-line bg-well/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13.5px] font-medium text-ink-2 hover:text-ink">
          Advanced: limits for this run
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 border-t border-line px-3 py-3 sm:grid-cols-3">
          <NumberField
            label="Iterations"
            term="agentIteration"
            value={maxIterations}
            onChange={setMaxIterations}
            min={CONFIG_LIMITS.maxIterations.min}
            max={CONFIG_LIMITS.maxIterations.max}
            hint={`${CONFIG_LIMITS.maxIterations.min}–${CONFIG_LIMITS.maxIterations.max} research rounds`}
          />
          <NumberField
            label="Apple budget"
            term="agentAppleBudget"
            value={appleBudget}
            onChange={setAppleBudget}
            min={CONFIG_LIMITS.appleBudget.min}
            max={CONFIG_LIMITS.appleBudget.max}
            hint={`${CONFIG_LIMITS.appleBudget.min}–${CONFIG_LIMITS.appleBudget.max} requests`}
          />
          <NumberField
            label="Keyword budget"
            term="agentKeywordBudget"
            value={maxKeywords}
            onChange={setMaxKeywords}
            min={CONFIG_LIMITS.maxKeywords.min}
            max={CONFIG_LIMITS.maxKeywords.max}
            hint={`${CONFIG_LIMITS.maxKeywords.min}–${CONFIG_LIMITS.maxKeywords.max} keywords scored`}
          />
          <p className="text-[12px] leading-relaxed text-ink-3 sm:col-span-3">
            <span className="font-semibold text-ink-2">Rough estimate:</span> if the run uses its whole Apple budget, the Apple requests
            alone take about{" "}
            <span className="tabular text-ink-2">
              {fmtMin(t.lo)}–{fmtMin(t.hi)} min
            </span>
            . Ranklark spaces requests {(t.minGap / 1000).toFixed(1)}–{(t.maxGap / 1000).toFixed(1)} s apart on purpose so Apple doesn't
            block you; answers it already has are free and instant. Claude's own thinking time comes on top.
          </p>
        </div>
      </details>

      {needsKey && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-2.5 text-[13px]">
          <KeyRound className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 basis-60 text-ink-2">
            To run research here, add your Claude API key in Settings. Or connect Claude Code there and start runs from your terminal on
            your Claude plan.
          </span>
          <Link href="/settings" className="btn-primary flex h-8 items-center gap-1 px-3 text-[13px]">
            Open Settings <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3">
        <p className="text-[12.5px] text-ink-3">
          {status?.scripted ? (
            <>
              <span className="font-medium text-warn">Scripted test model (no Claude calls)</span> · no API key needed ·{" "}
              <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
                settings
              </Link>
            </>
          ) : local ? (
            <>
              <span className="text-ink-2">{modelLabel(local.model)}</span> · {local.effort} effort ·{" "}
              {local.hasKey ? "your key from this browser" : status?.serverCredentials ? "this server's key" : "no key yet"} ·{" "}
              <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
                change
              </Link>
            </>
          ) : (
            " "
          )}
        </p>
        <button type="submit" disabled={busy || needsKey} className="btn-primary flex h-10 items-center gap-2 px-5 text-[15px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Run research
        </button>
      </div>
      {err && (
        <p role="alert" className="border-t border-line/70 px-4 py-2.5 text-[13px] text-bad">
          {err}
        </p>
      )}
    </form>
  );
}
