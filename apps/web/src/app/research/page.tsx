import { isCountry } from "@ranklark/core/apple";
import { listApps } from "@/features/keywords/server/queries";
import { ResearchClient } from "@/features/research/components/research-explorer";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ seed?: string; country?: string }> }) {
  const sp = await searchParams;
  const apps = listApps().map((a) => ({ id: a.id, name: a.name, icon: a.icon, country: a.primary_country }));
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">Keyword research</h1>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        Start from a seed. We expand it with Apple&apos;s own autocomplete and the titles of the apps that already rank, then score what you
        pick.
      </p>
      <ResearchClient apps={apps} initialSeed={(sp.seed ?? "").slice(0, 60)} initialCountry={isCountry(sp.country) ? sp.country : "us"} />
    </main>
  );
}
