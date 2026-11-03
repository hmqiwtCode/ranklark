"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { L } from "@/components/help";
import { compact } from "@/lib/format";
import { modelLabel } from "../lib/browser";
import { type Fact, type Finding, TOOL_INFO } from "../lib/contract";
import type { GraphNode } from "../lib/reduce";
import {
  FACT_KIND,
  FactChip,
  FactSourceBadge,
  fmtDuration,
  JsonBlock,
  NODE_STATUS,
  NodeStatusIcon,
  parseTime,
  ROLE,
  VerdictChip,
} from "./bits";

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/50 py-2 text-[13px] last:border-0">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line/70 px-5 py-4">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

/** Side panel with everything one node did: input, output, thinking summary, usage and the evidence it produced. */
export function NodeDrawer({
  node,
  facts,
  findings,
  requestedModel,
  onClose,
  onFact,
}: {
  node: GraphNode | null;
  facts: Fact[];
  findings: Finding[];
  requestedModel: string | null;
  onClose: () => void;
  onFact: (id: string) => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const open = !!node;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!node) return null;
  const role = ROLE[node.role];
  const Icon = role.icon;
  const st = NODE_STATUS[node.status];
  const myFacts = facts.filter((f) => node.factIds.includes(f.id));
  const myFindings = findings.filter((f) => node.findingIds.includes(f.id));
  const started = parseTime(node.startedAt);
  const tool = node.tool ? TOOL_INFO[node.tool] : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="node-drawer-title">
      <button
        type="button"
        aria-label="Close details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l border-line bg-card shadow-2xl shadow-black/60">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-line/70 bg-card px-5 py-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-2">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              <L term={role.term}>{role.label}</L>
              <span className={`inline-flex items-center gap-1 normal-case tracking-normal ${st.text}`}>
                <NodeStatusIcon status={node.status} /> {st.label}
              </span>
            </div>
            <h2 id="node-drawer-title" className="mt-0.5 break-words text-[17px] font-bold leading-snug">
              {node.label}
            </h2>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-3">
          <Row label="Iteration">{node.iteration || "Setup"}</Row>
          <Row label="Started">{started ? new Date(started).toLocaleTimeString("en", { hour12: false }) : "—"}</Row>
          <Row label="Duration">{node.status === "running" ? "still running" : fmtDuration(node.durationMs)}</Row>
          {tool && (
            <Row label="Tool">
              <span title={tool.description}>{tool.label}</span>
              <span className="block text-[11.5px] text-ink-3">
                {tool.apple ? "Calls Apple (or uses saved answers)" : "No Apple requests"}
              </span>
            </Row>
          )}
          {role.ai && (
            <Row label="Model">
              {node.model ? modelLabel(node.model) : node.status === "running" ? "…" : "—"}
              {node.model && requestedModel && modelLabel(node.model) !== modelLabel(requestedModel) && (
                <span className="block text-[11.5px] text-warn">fallback from {modelLabel(requestedModel)}</span>
              )}
            </Row>
          )}
          {node.usage && (
            <Row label={<L term="agentTokens">Tokens</L>}>
              <span className="tabular">
                {compact(node.usage.input)} in · {compact(node.usage.output)} out
              </span>
              {(node.usage.cacheRead > 0 || node.usage.cacheWrite > 0) && (
                <span className="block text-[11.5px] text-ink-3 tabular">
                  cache: {compact(node.usage.cacheRead)} read · {compact(node.usage.cacheWrite)} written
                </span>
              )}
            </Row>
          )}
        </div>

        {(node.summary || node.error) && (
          <Section title={node.error ? "Error" : "Summary"}>
            <p className={`whitespace-pre-wrap text-[13.5px] leading-relaxed ${node.error ? "text-bad" : "text-ink-2"}`}>
              {node.error ?? node.summary}
            </p>
          </Section>
        )}

        {node.thinking && (
          <Section title="Summarized thinking">
            <p className="mb-2 text-[11.5px] text-ink-3">Claude's own short summary of how it reasoned, as returned by the API.</p>
            <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-well p-3 text-[12.5px] leading-relaxed text-ink-2">
              {node.thinking}
            </div>
          </Section>
        )}

        {(node.input !== undefined || node.output !== undefined) && (
          <Section title="Data">
            <div className="flex flex-col gap-2">
              <JsonBlock label="Input" value={node.input} />
              <JsonBlock label="Output" value={node.output} defaultOpen={false} />
            </div>
          </Section>
        )}

        {myFacts.length > 0 && (
          <Section title={<L term="agentFacts">{`Facts produced (${myFacts.length})`}</L>}>
            <ul className="flex flex-col gap-2">
              {myFacts.map((f) => (
                <li key={f.id} className="rounded-lg bg-well px-3 py-2 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FactChip id={f.id} onClick={onFact} />
                    <span className="text-ink-3">{FACT_KIND[f.kind]}</span>
                    <span className="ml-auto flex flex-wrap gap-1">
                      {f.sources.map((s) => (
                        <FactSourceBadge key={s} source={s} />
                      ))}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-2">{f.summary}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {myFindings.length > 0 && (
          <Section title={<L term="agentFindings">{`Findings written (${myFindings.length})`}</L>}>
            <ul className="flex flex-col gap-2">
              {myFindings.map((f) => (
                <li key={f.id} className="rounded-lg bg-well px-3 py-2 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-ink-3">{f.id}</span>
                    <VerdictChip verdict={f.verdict} />
                  </div>
                  <p className="mt-1 text-ink-2">{f.claim}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {node.logs.length > 0 && (
          <Section title="Log">
            <ol className="max-h-64 overflow-auto rounded-lg border border-line bg-well p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
              {node.logs.map((l, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {l}
                </li>
              ))}
            </ol>
          </Section>
        )}
        <div className="h-6 shrink-0" />
      </aside>
    </div>
  );
}
