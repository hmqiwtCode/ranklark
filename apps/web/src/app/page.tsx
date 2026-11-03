import Link from "next/link";
import { AddAppForm } from "@/components/actions";
import { listApps } from "@/features/keywords/server/queries";
import { LiveShowcase } from "@/features/showcase/components/live-showcase";
import { PRESETS } from "@/features/showcase/server/showcase";

export const dynamic = "force-dynamic";

export default function Home() {
  const hasApps = listApps().length > 0;
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-[44px] font-extrabold leading-[1.05] tracking-[-1.5px] sm:text-[60px]">Rank-first ASO</h1>
        <p className="mx-auto mt-5 max-w-xl text-[18px] leading-relaxed text-ink-2 sm:text-[20px]">
          See where your apps really rank, which keywords are worth it, and what to change in your metadata.
        </p>
        <div className="mt-8">
          <AddAppForm big />
        </div>
        <p className="mt-3 text-[13px] text-ink-3">
          Self-hosted · no account · every number labelled with its source
          {hasApps && (
            <>
              {" "}
              ·{" "}
              <Link href="/apps" className="text-ink-2 underline underline-offset-2 hover:text-ink">
                open your dashboard
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="relative">
          <div className="pointer-events-none absolute -top-9 right-4 hidden items-center gap-2 font-hand text-[20px] text-ink-2 sm:flex">
            <svg width="34" height="18" viewBox="0 0 34 18" fill="none" aria-hidden>
              <path d="M33 2C22 3 12 7 3 15m0 0 1-6m-1 6 6-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Real App Store data — click anything
          </div>
          <div className="rounded-[22px] border border-line-strong/70 bg-[oklch(21%_0_0)] p-1.5 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="mx-auto text-[13px] text-ink-3">
                apps.apple.com · search · <span className="text-ink">United States</span>
              </span>
            </div>
            <div className="rounded-[18px] bg-page p-3 sm:p-5">
              <LiveShowcase presets={PRESETS} />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line/70 py-8 text-center text-xs text-ink-3">
        Ranklark · data read from Apple&apos;s public App Store · not affiliated with Apple ·{" "}
        <Link href="/methodology" className="underline underline-offset-2 hover:text-ink-2">
          how every number is measured
        </Link>
      </footer>
    </main>
  );
}
