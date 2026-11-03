"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentStatus } from "../lib/contract";

/** GET /api/agent/status. `error` is set when the server can't be asked (the agent API may be missing or down). */
export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/agent/status", { cache: "no-store" });
      if (!r.ok)
        throw new Error(r.status === 404 ? "The AI research API isn't available on this server." : `The server answered ${r.status}.`);
      setStatus((await r.json()) as AgentStatus);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { status, error, loading, reload: load, setStatus };
}
