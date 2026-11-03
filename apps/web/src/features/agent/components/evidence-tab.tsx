"use client";

import { Network } from "lucide-react";
import { L } from "@/components/help";
import type { Fact } from "../lib/contract";
import { Empty, FACT_KIND, FactSourceBadge, factSubject } from "./bits";

export function EvidenceTab({
  facts,
  flashId,
  onShowNode,
}: {
  facts: Fact[];
  /** Fact to scroll to and briefly highlight. */
  flashId: string | null;
  onShowNode: (nodeId: string) => void;
}) {
  if (!facts.length) return <Empty>No evidence yet. Workers add facts as they read App Store data.</Empty>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <thead className="text-[12px] text-ink-3">
          <tr className="border-b border-line/70">
            <th className="py-2.5 pl-4 font-medium">
              <L term="agentFacts">Fact</L>
            </th>
            <th className="px-3 font-medium">Kind</th>
            <th className="px-3 font-medium">About</th>
            <th className="px-3 font-medium">Summary (written by code)</th>
            <th className="px-3 font-medium">
              <L term="agentFactSource">Source</L>
            </th>
            <th className="px-3 font-medium">
              <L term="agentIteration">Iteration</L>
            </th>
            <th className="px-3 pr-4 font-medium">
              <span className="sr-only">Worker</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr
              key={f.id}
              id={`fact-${f.id}`}
              className={`scroll-mt-24 border-b border-line/40 align-top transition-colors duration-700 ${flashId === f.id ? "bg-sky/10" : "hover:bg-white/[0.025]"}`}
            >
              <td className="py-2.5 pl-4 font-mono text-[12px] text-ink-2">{f.id}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{FACT_KIND[f.kind] ?? f.kind}</td>
              <td className="max-w-[180px] truncate px-3 py-2.5 font-medium" title={factSubject(f)}>
                {factSubject(f)}
              </td>
              <td className="px-3 py-2.5 leading-snug text-ink-2">{f.summary}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {f.sources.map((s) => (
                    <FactSourceBadge key={s} source={s} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2.5 tabular text-ink-3">{f.iteration || "Setup"}</td>
              <td className="px-3 py-2.5 pr-4">
                <button
                  type="button"
                  onClick={() => onShowNode(f.nodeId)}
                  title="Show the worker that produced this fact in the graph"
                  aria-label={`Show the worker that produced ${f.id} in the graph`}
                  className="btn-ghost grid h-7 w-7 place-items-center"
                >
                  <Network className="h-3.5 w-3.5 text-ink-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
