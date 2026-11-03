/** Types shared by the background worker and the popup. */
import type { DeviceStatus } from "@ranklark/core/protocol";

export type Config = { server: string; token: string; paused?: boolean };

/** Full local status (a superset of what is reported to the dashboard). */
export type Status = DeviceStatus & {
  startedAt?: string;
  hostBackoff?: Record<string, { until: number; minutes: number }>;
  last?: { serp: number; hints: number; apps: number; errors: number };
};

/** Messages the popup (internal) or a paired dashboard page (external) can send. */
export type Message =
  | { type: "ping" }
  | { type: "status" }
  | { type: "connect"; server: string } // popup: no-login connect by server address
  | { type: "pair"; server: string; token: string } // dashboard: hands over a key it minted
  | { type: "run" }
  | { type: "pause"; paused: boolean }
  | { type: "unpair" };

export type StatusReply = { ok: boolean; status: Status; paired: boolean; server: string | null; paused: boolean; version: string };
export type Reply = { ok: boolean; error?: string; [k: string]: unknown };
