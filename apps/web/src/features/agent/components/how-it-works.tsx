import { Hammer, ListChecks, Microscope, PenLine, Route, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";

const STEPS = [
  { icon: Route, who: "Claude", name: "Planner", text: "decides what to look up next." },
  { icon: Hammer, who: "Ranklark", name: "Workers", text: "read App Store data and save it as facts." },
  { icon: Microscope, who: "Claude", name: "Analyst", text: "writes findings, each citing its facts." },
  { icon: ListChecks, who: "Rules + Claude", name: "Checker", text: "verifies them and decides if there's enough evidence." },
  { icon: PenLine, who: "Claude", name: "Composer", text: "writes the name, subtitle and keyword field." },
  { icon: ShieldCheck, who: "Ranklark", name: "Validator", text: "checks Apple's limits and rules." },
] as const;

/** Static explainer next to the start form (server-rendered). */
export function HowItWorks() {
  return (
    <aside className="card flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-[15px] font-semibold">How it works</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          The first four steps repeat until the checker is satisfied or a limit is reached. You watch every step live.
        </p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {STEPS.map((s, i) => (
          <li key={s.name} className="flex items-start gap-2.5 text-[13px]">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-ink-2">
              <s.icon className="h-3.5 w-3.5" />
            </span>
            <span className="leading-snug text-ink-2">
              <span className="font-semibold text-ink">{s.name}</span> <span className="text-[11px] text-ink-3">({s.who})</span> {s.text}
              {i === 3 && <span className="mt-0.5 block text-[11.5px] text-ink-3">↺ back to the planner when more evidence is needed</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="rounded-lg bg-well px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-3">
        Every number comes from Apple data or Ranklark's published formulas, never from the AI. Unknown values show as “—”.
      </p>
      <Link href="/settings#claude-code" className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-3 hover:text-ink">
        <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Use Claude Code instead? Connect it in Settings and start runs from your terminal on your Claude plan, no API key.</span>
      </Link>
    </aside>
  );
}
