import { DataSources } from "@/features/settings/components/data-sources";
import { SettingsClient } from "@/features/settings/components/settings-client";
import { adsConfigured } from "@/server/apple/ads";
import { fetchMode } from "@/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Ranklark" };

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-[30px] font-extrabold tracking-tight">Settings</h1>
      <p className="mb-6 mt-1 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Connect Claude for AI research, either with your own API key (kept in this browser) or through Claude Code on your Claude plan.
      </p>
      <div className="flex flex-col gap-4">
        <SettingsClient />
        <DataSources mode={fetchMode()} ads={adsConfigured()} />
      </div>
    </main>
  );
}
