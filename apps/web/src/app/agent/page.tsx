import { HowItWorks } from "@/features/agent/components/how-it-works";
import { RunHistory } from "@/features/agent/components/run-history";
import { StartForm } from "@/features/agent/components/start-form";
import { listApps } from "@/features/keywords/server/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI research — Ranklark" };

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const sp = await searchParams;
  const apps = listApps().map((a) => ({ id: a.id, name: a.name, icon: a.icon, country: a.primary_country }));
  const initialApp = apps.find((a) => a.id === Number(sp.app))?.id ?? null;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-[28px] font-extrabold tracking-tight">AI research</h1>
      <p className="mb-5 mt-1 max-w-3xl text-[15px] text-ink-2">
        A team of Claude roles researches keywords for your app using real App Store data, checks its own findings, and recommends an app
        name, subtitle and keyword field. Uses your own Claude account.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <StartForm apps={apps} initialApp={initialApp} />
        <HowItWorks />
      </div>
      <div className="mt-4">
        <RunHistory />
      </div>
    </main>
  );
}
