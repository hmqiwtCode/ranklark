"use client";

import { Help, L } from "@/components/help";
import type { Finding } from "../lib/contract";
import type { IterationView } from "../lib/reduce";
import { Empty, FactChip, VerdictChip } from "./bits";

const KIND: Record<Finding["kind"], { label: string; cls: string }> = {
  opportunity: { label: "Opportunity", cls: "bg-good/15 text-good" },
  risk: { label: "Risk", cls: "bg-bad/15 text-bad" },
  insight: { label: "Insight", cls: "bg-sky/15 text-sky" },
  drop: { label: "Drop", cls: "bg-white/10 text-ink-2" },
};

const CONF: Record<Finding["confidence"], string> = { high: "text-ink", medium: "text-ink-2", low: "text-ink-3" };

export function FindingsTab({
  findings,
  iterations,
  factIds,
  onFact,
}: {
  findings: Finding[];
  iterations: IterationView[];
  factIds: Set<string>;
  onFact: (id: string) => void;
}) {
  if (!findings.length) return <Empty>No findings yet. The analyst writes them after the workers have collected evidence.</Empty>;
  const groups = [...new Set(findings.map((f) => f.iteration))].sort((a, b) => a - b);
  const counts = {
    supported: findings.filter((f) => f.verdict?.status === "supported").length,
    unsupported: findings.filter((f) => f.verdict?.status === "unsupported").length,
    needs: findings.filter((f) => f.verdict?.status === "needs_data").length,
  };
  return (
    <div className="flex flex-col">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line/70 px-4 py-2.5 text-[12.5px] text-ink-3">
        <span>
          <L term="agentVerdict">Verdicts</L>
        </span>
        <span className="text-good tabular">{counts.supported} supported</span>
        <span className="text-bad tabular">{counts.unsupported} unsupported</span>
        <span className="text-warn tabular">{counts.needs} need data</span>
        <span className="tabular">{findings.length - counts.supported - counts.unsupported - counts.needs} not checked yet</span>
      </p>
      {groups.map((g) => {
        const it = iterations.find((i) => i.n === g);
        const list = findings.filter((f) => f.iteration === g);
        return (
          <section key={g} className="border-b border-line/70 last:border-0">
            <h3 className="flex flex-wrap items-center gap-2 bg-white/[0.015] px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              {g ? `Iteration ${g}` : "Setup"}
              {it?.converged != null && (
                <span className={`font-medium normal-case tracking-normal ${it.converged ? "text-good" : "text-warn"}`}>
                  · {it.converged ? "checker: evidence good enough" : "checker: needs more evidence"}
                </span>
              )}
            </h3>
            <ul>
              {list.map((f) => (
                <li key={f.id} className="flex flex-col gap-1.5 border-t border-line/40 px-4 py-3 first:border-0">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-mono text-[11px] text-ink-3">{f.id}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${KIND[f.kind]?.cls ?? ""}`}>
                      {KIND[f.kind]?.label ?? f.kind}
                    </span>
                    <span className={`inline-flex items-center ${CONF[f.confidence] ?? ""}`}>
                      {f.confidence} confidence
                      <Help term="agentConfidence" />
                    </span>
                    <span className="sm:ml-auto">
                      <VerdictChip verdict={f.verdict} />
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-ink">{f.claim}</p>
                  {f.verdict?.note && <p className="text-[12.5px] leading-relaxed text-ink-3">{f.verdict.note}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {f.terms.map((t) => (
                      <span key={t} className="rounded-full border border-line px-2 py-px text-[11.5px] text-ink-2">
                        {t}
                      </span>
                    ))}
                    {f.terms.length > 0 && f.factIds.length > 0 && <span className="mx-1 h-3 w-px bg-line" />}
                    {f.factIds.map((id) => (
                      <FactChip key={id} id={id} onClick={onFact} missing={!factIds.has(id)} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
