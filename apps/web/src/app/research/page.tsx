import { isCountry } from "@ranklark/core/apple";
import { phrasesFrom } from "@ranklark/core/metadata";
import { listApps } from "@/features/keywords/server/queries";
import { ResearchClient } from "@/features/research/components/research-explorer";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ seed?: string; country?: string; app?: string }> }) {
  const sp = await searchParams;
  const list = listApps();
  const apps = list.map((a) => ({ id: a.id, name: a.name, icon: a.icon, country: a.primary_country }));
  const initialApp = apps.find((a) => a.id === Number(sp.app)) ?? (apps.length === 1 ? apps[0] : null);
  // Starter ideas: two-word phrases from your apps' names/subtitles, else generic examples.
  const fromApps = [
    ...new Set(list.flatMap((a) => [...phrasesFrom(a.name), ...phrasesFrom(a.subtitle)]).filter((p) => p.split(" ").length === 2)),
  ];
  const ideas = (fromApps.length ? fromApps : ["habit tracker", "budget planner", "water reminder", "photo editor"]).slice(0, 6);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">Find keywords</h1>
      <p className="mb-5 mt-1 max-w-3xl text-[15px] text-ink-2">
        Type a few words that describe your app. We show what people actually search for around them, how popular and how hard each one is,
        and where your app ranks today.
      </p>
      <ResearchClient
        apps={apps}
        ideas={ideas}
        initialApp={initialApp?.id ?? null}
        initialSeed={(sp.seed ?? "").slice(0, 60)}
        initialCountry={isCountry(sp.country) ? sp.country : (initialApp?.country ?? "us")}
      />
    </main>
  );
}
