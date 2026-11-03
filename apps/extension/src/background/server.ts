/** Client for the user's own dashboard server (see @ranklark/core/protocol for the wire format). */
import { type Task, type TaskResult, VERSION_HEADER } from "@ranklark/core/protocol";
import type { Config } from "../shared/types";
import { snapshot, VERSION } from "./state";

export class Unauthorized extends Error {}

const base = (server: string) => server.trim().replace(/\/$/, "");

async function call<T>(cfg: Config, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base(cfg.server) + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", [VERSION_HEADER]: VERSION },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "omit",
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Unauthorized("This browser was disconnected (removed on the dashboard). Connect again from the popup.");
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Dashboard HTTP ${res.status}`);
  return json as T;
}

export const fetchTasks = (cfg: Config) => call<{ tasks: Task[] }>(cfg, "/api/ext/tasks").then((r) => r.tasks);
export const postResult = (cfg: Config, result: TaskResult) =>
  call(cfg, "/api/ext/results", { version: VERSION, results: [result], status: snapshot() });
export const heartbeat = (cfg: Config) => call(cfg, "/api/ext/heartbeat", { status: snapshot() }).catch(() => undefined);

/** No-login connect: the dashboard gives this browser its own device key. */
export async function connect(server: string): Promise<Config> {
  const url = base(server);
  if (!/^https?:\/\/[^/]+$/.test(url)) throw new Error("Enter the dashboard address, e.g. http://localhost:3100");
  let res: Response;
  try {
    res = await fetch(`${url}/api/ext/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "omit",
    });
  } catch {
    throw new Error(`Can't reach ${url}. Is the dashboard running?`);
  }
  const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !json.token) throw new Error(json.error ?? `Dashboard HTTP ${res.status}`);
  return { server: url, token: json.token };
}
