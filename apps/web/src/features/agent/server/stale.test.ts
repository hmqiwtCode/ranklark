import { describe, expect, it } from "vitest";
import { MCP_IDLE_MS, processAlive, staleReason } from "./stale";

const NOW = 1_800_000_000_000;
const ctx = (over: Partial<Parameters<typeof staleReason>[2]> = {}) => ({
  pid: 100,
  now: NOW,
  drivenHere: () => true,
  alive: () => true,
  ...over,
});

describe("staleReason", () => {
  it("keeps an API run this process is driving", () => {
    expect(staleReason("r", { source: "api", ownerPid: 100, lastActivityMs: NOW }, ctx())).toBeNull();
  });

  it("closes an API run whose owner process is gone (server restart)", () => {
    expect(staleReason("r", { source: "api", ownerPid: 99, lastActivityMs: NOW }, ctx({ alive: () => false }))).toMatch(/restarted/);
  });

  it("keeps an API run owned by another live process (a dev helper process must not interrupt the server's runs)", () => {
    expect(staleReason("r", { source: "api", ownerPid: 99, lastActivityMs: NOW }, ctx({ alive: () => true }))).toBeNull();
  });

  it("closes our-pid runs our loop no longer holds (pid reused after a restart)", () => {
    expect(staleReason("r", { source: "api", ownerPid: 100, lastActivityMs: NOW }, ctx({ drivenHere: () => false }))).toMatch(/restarted/);
  });

  it("closes API runs created before owners were recorded", () => {
    expect(staleReason("r", { source: "api", ownerPid: null, lastActivityMs: NOW }, ctx())).toMatch(/restarted/);
  });

  it("never treats an MCP run as restarted, only as idle", () => {
    const fresh = { source: "mcp" as const, ownerPid: null, lastActivityMs: NOW - MCP_IDLE_MS + 1000 };
    expect(staleReason("r", fresh, ctx({ alive: () => false, drivenHere: () => false }))).toBeNull();
    expect(staleReason("r", { ...fresh, lastActivityMs: NOW - MCP_IDLE_MS - 1 }, ctx())).toMatch(/no calls/);
  });
});

describe("processAlive", () => {
  it("sees this process and not an impossible pid", () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(2 ** 22 + 12345)).toBe(false);
  });
});
