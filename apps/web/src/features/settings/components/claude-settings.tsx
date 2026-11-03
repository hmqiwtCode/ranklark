"use client";

import { Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  isScriptedModel,
  maskKey,
  modelLabel,
  readLocal,
  removeLocal,
  savedEffort,
  savedModel,
  writeLocal,
} from "@/features/agent/lib/browser";
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  type AgentEffort,
  type AgentModelId,
  type AgentStatus,
  KEY_HEADER,
  type KeyCheckResult,
  PRICES_AS_OF,
} from "@/features/agent/lib/contract";

const EFFORT_TEXT: Record<AgentEffort, string> = {
  low: "Fastest and cheapest, with the least careful reasoning.",
  medium: "A balance of speed and care.",
  high: "Careful reasoning. Recommended for research (default).",
  xhigh: "Extra reasoning for harder cases. Slower and costs more.",
  max: "As much reasoning as the model allows. Slowest and most expensive.",
};

const usd = (n: number) => `$${n < 1 ? n.toFixed(2) : n % 1 ? n.toFixed(2) : n}`;

function SavedTick({ show }: { show: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-[12px] text-good transition-opacity ${show ? "opacity-100" : "opacity-0"}`}
    >
      <Check className="h-3.5 w-3.5" /> Saved
    </span>
  );
}

export function ClaudeSettings({ status }: { status: AgentStatus | null }) {
  const inputId = useId();
  // localStorage is only read after mount, so the server render and the first client render match.
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState<AgentModelId>("claude-opus-5-5");
  const [effort, setEffort] = useState<AgentEffort>("high");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<KeyCheckResult | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tick, setTick] = useState<"model" | "effort" | null>(null);

  useEffect(() => {
    setSaved(readLocal("apiKey")?.trim() || null);
    setModel(savedModel());
    setEffort(savedEffort());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(() => setTick(null), 1400);
    return () => clearTimeout(t);
  }, [tick]);

  const showInput = ready && (!saved || editing);
  const keyToTest = showInput && draft.trim() ? draft.trim() : saved;

  const runTest = async () => {
    if (!keyToTest) return;
    setTest(null);
    // The scripted test model makes no Claude calls, so there is nothing to check and the key isn't sent anywhere.
    if (status?.scripted) {
      setTest({ ok: true, model: "scripted-test" });
      return;
    }
    setTesting(true);
    try {
      const r = await fetch("/api/agent/key-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", [KEY_HEADER]: keyToTest },
        body: JSON.stringify({ model }),
      });
      const j = (await r.json().catch(() => null)) as KeyCheckResult | null;
      setTest(
        j && typeof j.ok === "boolean"
          ? j
          : { ok: false, error: r.status === 404 ? "The key check isn't available on this server." : `The server answered ${r.status}.` },
      );
    } catch {
      setTest({ ok: false, error: "Couldn't reach your Ranklark server." });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const k = draft.trim();
    if (!k) return;
    if (writeLocal("apiKey", k)) {
      setSaved(k);
      setDraft("");
      setEditing(false);
      setShow(false);
      setNote({ ok: true, text: "Saved in this browser." });
    } else {
      setNote({ ok: false, text: "This browser refused to save it (private window or blocked site data). You can still test it." });
    }
  };

  const remove = () => {
    if (!window.confirm("Remove the Claude API key from this browser? You'll need to paste it again to run research here.")) return;
    removeLocal("apiKey");
    setSaved(null);
    setTest(null);
    setEditing(false);
    setNote({ ok: true, text: "Removed from this browser." });
  };

  return (
    <section className="card" aria-labelledby="claude-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <h2 id="claude-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <KeyRound className="h-4 w-4 text-ink-3" /> Claude API key
        </h2>
        {ready && (
          <span
            className={`rounded-full border px-2 py-px text-[11.5px] font-semibold ${saved ? "border-good/30 bg-good/10 text-good" : "border-line-strong text-ink-3"}`}
          >
            {saved ? "Saved in this browser" : "No key saved"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Paste your Claude API key (it starts with <code className="rounded bg-well px-1 font-mono text-[12.5px]">sk-ant-</code>) to run AI
          research from the AI research page. Usage is billed to your Anthropic account.
          {status?.scripted ? (
            <span className="mt-2 block rounded-lg border border-warn/30 bg-warn/[0.07] px-3 py-2 text-warn">
              <span className="font-semibold">Scripted test model (no Claude calls).</span> This server runs with RANKLARK_AGENT_SCRIPTED=1,
              so runs use a built-in test model instead of Claude. A browser key is optional and isn't used.
            </span>
          ) : (
            status?.serverCredentials && (
              <span className="mt-1 block text-ink-3">
                This server has its own Claude credentials, so a browser key is optional here. If you save one, your runs use yours.
              </span>
            )
          )}
        </p>

        {!ready ? (
          <div className="h-10 animate-pulse rounded-lg bg-well" />
        ) : showInput ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-[13px] text-ink-2">
              {saved ? "New key" : "API key"}
            </label>
            <div className="flex flex-wrap gap-2">
              <div className="field flex h-10 min-w-0 flex-1 basis-64 items-center">
                <input
                  id={inputId}
                  type={show ? "text" : "password"}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setTest(null);
                    setNote(null);
                  }}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-ink-3"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide key" : "Show key"}
                  aria-pressed={show}
                  className="grid h-full w-10 shrink-0 place-items-center text-ink-3 hover:text-ink"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={runTest}
                disabled={!draft.trim() || testing}
                className="btn-ghost flex h-10 items-center gap-2 px-3 text-sm"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Test key
              </button>
              <button type="button" onClick={save} disabled={!draft.trim()} className="btn-primary h-10 px-4 text-sm">
                Save in this browser
              </button>
              {saved && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft("");
                    setTest(null);
                  }}
                  className="btn-ghost h-10 px-3 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
            {draft.trim() && !draft.trim().startsWith("sk-ant-") && (
              <p className="text-[12px] text-warn">
                That doesn't look like a Claude API key (they start with “sk-ant-”). Test it to be sure.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex h-10 min-w-0 flex-1 basis-48 items-center rounded-lg border border-line bg-well px-3 font-mono text-[13px] text-ink-2">
              {saved ? maskKey(saved) : ""}
            </code>
            <button type="button" onClick={runTest} disabled={testing} className="btn-ghost flex h-10 items-center gap-2 px-3 text-sm">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Test key
            </button>
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost h-10 px-3 text-sm">
              Replace
            </button>
            <button type="button" onClick={remove} className="btn-ghost flex h-10 items-center gap-1.5 px-3 text-sm text-bad">
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          </div>
        )}

        {test && (
          <p role="status" className={`flex items-start gap-2 text-[13px] ${test.ok ? "text-good" : "text-bad"}`}>
            {test.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            {test.ok
              ? isScriptedModel(test.model)
                ? "Scripted test model (no Claude calls): runs work without checking this key, and the key isn't sent anywhere."
                : `The key works. ${modelLabel(test.model)} is available to it.`
              : test.error}
          </p>
        )}
        {note && !test && <p className={`text-[13px] ${note.ok ? "text-good" : "text-warn"}`}>{note.text}</p>}

        <div className="flex gap-3 rounded-lg border border-line bg-well/70 p-3 text-[12.5px] leading-relaxed text-ink-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" />
          <div>
            <span className="font-semibold text-ink-2">Where your key goes.</span> It is stored only in this browser. It is sent to your
            Ranklark server only when you test it or start a run, in a request header. The server keeps it in memory for that run and never
            saves it to disk or the database, never logs it and never sends it back. Requests to Claude go from your server to
            api.anthropic.com.
          </div>
        </div>
      </div>

      <div className="border-t border-line/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold" id="model-label">
            Model
          </h3>
          <SavedTick show={tick === "model"} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {AGENT_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={model === m.id}
              onClick={() => {
                setModel(m.id);
                if (writeLocal("model", m.id)) setTick("model");
              }}
              className={`flex flex-col gap-0.5 rounded-lg border p-3 text-left transition ${model === m.id ? "border-primary/70 bg-primary/[0.07]" : "border-line bg-well hover:border-line-strong"}`}
            >
              <span className="text-[13.5px] font-semibold">{m.label}</span>
              <span className="text-[12px] text-ink-3">{m.note}</span>
              <span className="mt-1 text-[12px] text-ink-2 tabular">
                {usd(m.price.input)} in / {usd(m.price.output)} out
                <span className="text-ink-3"> per 1M tokens</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">
          Anthropic list prices as of {PRICES_AS_OF}, used only for the “Est. cost” figure on a run.
        </p>
      </div>

      <div className="border-t border-line/70 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold" id="effort-label">
            Effort
          </h3>
          <SavedTick show={tick === "effort"} />
        </div>
        <div className="seg flex-wrap">
          {AGENT_EFFORTS.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={effort === e}
              data-active={effort === e}
              onClick={() => {
                setEffort(e);
                if (writeLocal("effort", e)) setTick("effort");
              }}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">
          How hard Claude thinks before answering. <span className="text-ink-2">{EFFORT_TEXT[effort]}</span>
        </p>
      </div>
    </section>
  );
}
