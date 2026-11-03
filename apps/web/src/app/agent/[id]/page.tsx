import { RunPage } from "@/features/agent/components/run-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research run — Ranklark" };

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: a fresh client state (and event stream) per run
  return <RunPage key={id} id={id} />;
}
