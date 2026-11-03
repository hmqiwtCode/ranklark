"use client";

import { AlertTriangle, Loader2, Power, RotateCw, Terminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyButton } from "@/features/agent/components/bits";
import type { McpSettings as McpState } from "@/features/agent/lib/contract";

const command = (url: string, token: string) => `claude mcp add --transport http ranklark ${url} --header "Authorization: Bearer ${token}"`;

export function McpSettings({ initial, loadError, onRetry }: { initial: McpState | null; loadError: string | null; onRetry: () => void }) {
  const [mcp, setMcp] = useState<McpState | null>(initial);
  const [busy, setBusy] = useState<"enable" | "rotate" | "disable" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setMcp(initial), [initial]);

  const call = async (method: "POST" | "DELETE", kind: "enable" | "rotate" | "disable") => {
    setBusy(kind);
    setErr(null);
    try {
      const r = await fetch("/api/settings/mcp", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      const j = (await r.json().catch(() => null)) as (McpState & { error?: string }) | null;
      if (!r.ok || !j || typeof j.enabled !== "boolean") {
        setErr(j?.error ?? (r.status === 404 ? "MCP settings aren't available on this server." : `The server answered ${r.status}.`));
        return;
      }
      setMcp(j);
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="claude-code" className="card scroll-mt-6" aria-labelledby="mcp-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
        <h2 id="mcp-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <Terminal className="h-4 w-4 text-ink-3" /> Claude Code (MCP)
        </h2>
        {mcp && (
          <span
            className={`rounded-full border px-2 py-px text-[11.5px] font-semibold ${mcp.enabled ? "border-good/30 bg-good/10 text-good" : "border-line-strong text-ink-3"}`}
          >
            {mcp.enabled ? "Enabled" : "Off"}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Let your own Claude Code run the research: it works on your Claude plan with no API key, uses Ranklark's App Store tools, and the
          run shows up live on the{" "}
          <Link href="/agent" className="text-ink underline underline-offset-2">
            AI research
          </Link>{" "}
          page.
        </p>

        {!mcp ? (
          loadError ? (
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-3">
              <span>{loadError}</span>
              <button type="button" onClick={onRetry} className="btn-ghost flex h-8 items-center gap-1.5 px-2.5 text-[12.5px]">
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : (
            <div className="h-10 animate-pulse rounded-lg bg-well" />
          )
        ) : !mcp.enabled ? (
          <div>
            <button
              type="button"
              onClick={() => call("POST", "enable")}
              disabled={!!busy}
              className="btn-primary flex h-10 items-center gap-2 px-4 text-sm"
            >
              {busy === "enable" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Enable Claude Code access
            </button>
            <p className="mt-2 text-[12px] text-ink-3">You get a one-time token and a command to paste into your terminal.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mcp.token ? (
              <div className="flex flex-col gap-2 rounded-lg border border-warn/30 bg-warn/[0.06] p-3">
                <p className="flex items-start gap-2 text-[13px] text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Copy this now. The token is shown only once; Ranklark keeps only a fingerprint of it.
                </p>
                <p className="text-[12.5px] text-ink-2">1. Run this in your terminal:</p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-well p-3 font-mono text-[12px] leading-relaxed text-ink">
                  {command(mcp.url, mcp.token)}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={command(mcp.url, mcp.token)} label="Copy command" />
                  <CopyButton text={mcp.token} label="Copy token only" />
                </div>
              </div>
            ) : (
              <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-3">Endpoint</dt>
                <dd className="break-all font-mono text-[12.5px] text-ink-2">{mcp.url}</dd>
                <dt className="text-ink-3">Token</dt>
                <dd className="text-ink-2">
                  ending in <span className="font-mono">…{mcp.tokenHint ?? "????"}</span>
                  <span className="block text-[12px] text-ink-3">Lost the command? Rotate the token to get a new one.</span>
                </dd>
              </dl>
            )}
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              {mcp.token ? "2. " : ""}In Claude Code, ask for it in your own words, for example: “Use ranklark to research keywords and a
              better name for my app in the US store.”
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm("Make a new token? The current one stops working right away, so you'll need to run the new command."))
                    call("POST", "rotate");
                }}
                className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm"
              >
                {busy === "rotate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                Rotate token
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm("Turn off Claude Code access? Claude Code will no longer be able to use Ranklark."))
                    call("DELETE", "disable");
                }}
                className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm text-bad"
              >
                {busy === "disable" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                Disable
              </button>
            </div>
          </div>
        )}
        {err && <p className="text-[13px] text-bad">{err}</p>}
      </div>
    </section>
  );
}
