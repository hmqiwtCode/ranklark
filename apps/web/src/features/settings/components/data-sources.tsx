import { Database } from "lucide-react";
import { Help } from "@/components/help";
import { SourceBadge } from "@/components/ui";

/** Read-only: how this server gets App Store data. Values come from the server's environment. */
export function DataSources({ mode, ads }: { mode: "server" | "extension"; ads: boolean }) {
  return (
    <section className="card" aria-labelledby="data-title">
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-3">
        <Database className="h-4 w-4 text-ink-3" />
        <h2 id="data-title" className="text-[15px] font-semibold">
          Data sources
        </h2>
      </div>
      <dl className="flex flex-col divide-y divide-line/60 text-[13.5px]">
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="w-44 shrink-0 text-ink-3">
            <span className="inline-flex items-center">
              Who calls Apple
              <Help term="fetchMode" />
            </span>
          </dt>
          <dd className="text-ink-2">
            <span className="font-semibold text-ink">{mode === "server" ? "This server" : "Browser extension only"}</span>
            <span className="block text-[12.5px] leading-relaxed text-ink-3">
              {mode === "server"
                ? "The AI research agent can fetch fresh App Store data, spaced out so Apple doesn't block you."
                : "The server never calls Apple, so the AI research agent can only use App Store data Ranklark has already saved. Anything else fails with “waiting for the extension”."}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="w-44 shrink-0 text-ink-3">Popularity</dt>
          <dd className="text-ink-2">
            <span className="inline-flex items-center gap-2 font-semibold text-ink">
              {ads ? "Apple Ads connected" : "Apple Ads not set up"}
              <SourceBadge source={ads ? "apple_ads" : "hints_estimate"} />
            </span>
            <span className="block text-[12.5px] leading-relaxed text-ink-3">
              {ads
                ? "Popularity uses Apple's own Search Popularity where Apple has it, and our estimate otherwise."
                : "Popularity is our estimate from App Store autocomplete, labelled “Est.”."}
            </span>
          </dd>
        </div>
      </dl>
      <p className="border-t border-line/70 px-4 py-2.5 text-[12px] text-ink-3">
        Set on the server with environment variables (<code className="font-mono">ASO_FETCH_MODE</code>,{" "}
        <code className="font-mono">ADS_*</code>), so they can't be changed here.
      </p>
    </section>
  );
}
