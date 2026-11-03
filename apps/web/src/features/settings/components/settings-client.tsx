"use client";

import { useAgentStatus } from "@/features/agent/components/use-status";
import { ClaudeSettings } from "./claude-settings";
import { McpSettings } from "./mcp-settings";

/** The two ways to connect Claude. Both read GET /api/agent/status once. */
export function SettingsClient() {
  const { status, error, reload } = useAgentStatus();
  return (
    <>
      <ClaudeSettings status={status} />
      <McpSettings initial={status?.mcp ?? null} loadError={error} onRetry={reload} />
    </>
  );
}
