/**
 * When is a run that is still marked "running" actually dead? Pure, so it can be tested without a DB.
 *
 * This replaces a sweep at module load. `next dev` and `next build` evaluate route modules in short-lived helper
 * processes, so "this module just loaded" doesn't mean "the server restarted", and that sweep interrupted live runs.
 */

/** No MCP tool call for this long closes an MCP run: Claude Code has evidently stopped. */
export const MCP_IDLE_MS = 60 * 60_000;

export type RunLiveness = {
  source: "api" | "mcp";
  /** Process driving an API run; null for MCP runs and runs created before owners were recorded. */
  ownerPid: number | null;
  /** Last event (or creation) time, epoch ms. */
  lastActivityMs: number;
};

export type LivenessContext = {
  pid: number;
  now: number;
  /** Is this process's run loop still driving the run? */
  drivenHere: (runId: string) => boolean;
  /** Does a process with this id exist? */
  alive: (pid: number) => boolean;
};

/** The reason a running run should be closed as interrupted, or null when it may still be alive. */
export function staleReason(runId: string, r: RunLiveness, ctx: LivenessContext): string | null {
  if (r.source === "mcp") {
    return ctx.now - r.lastActivityMs > MCP_IDLE_MS ? "Claude Code made no calls to this run for over an hour, so it was closed." : null; // Claude Code drives it from outside; a server restart doesn't stop it
  }
  const restarted = "The server restarted while this run was in progress.";
  if (r.ownerPid == null) return restarted;
  // our own pid: only alive if our loop still holds it (also catches a restarted server that reused the pid)
  if (r.ownerPid === ctx.pid) return ctx.drivenHere(runId) ? null : restarted;
  // another process (e.g. the server itself, seen from a dev helper process): alive as long as it exists
  return ctx.alive(r.ownerPid) ? null : restarted;
}

/** `process.kill(pid, 0)` probes without signalling; EPERM still means the process exists. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}
