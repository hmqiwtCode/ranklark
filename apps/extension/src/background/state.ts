/** Persistent config + status in chrome.storage.local, and the toolbar badge. */
import type { Config, Status } from "../shared/types";

export const VERSION = chrome.runtime.getManifest().version;
export const today = () => new Date().toISOString().slice(0, 10);

export async function getConfig(): Promise<Config | null> {
  const { config } = (await chrome.storage.local.get("config")) as { config?: Partial<Config> };
  return config?.server && config?.token ? (config as Config) : null;
}
export const setConfig = (config: Config) => chrome.storage.local.set({ config });
export const clearConfig = () => chrome.storage.local.remove(["config"]);

const EMPTY: Status = { state: "idle", done: 0, total: 0, requestsToday: 0 };
let status: Status = EMPTY;

export const currentStatus = () => status;

/** Reload from storage (the service worker may have been restarted since the last write). */
export async function loadStatus(): Promise<Status> {
  const { status: saved } = await chrome.storage.local.get("status");
  status = (saved as Status) ?? EMPTY;
  return status;
}

/** Every save is also an extension API call, which keeps the service worker alive during a long run. */
export async function saveStatus(patch: Partial<Status> = {}) {
  status = { ...status, ...patch };
  await chrome.storage.local.set({ status });
  await updateBadge();
}

async function updateBadge() {
  const s = status;
  const text = s.state === "running" ? String(Math.max(0, s.total - s.done)) : s.state === "error" || s.state === "backoff" ? "!" : "";
  await chrome.action.setBadgeBackgroundColor({ color: s.state === "running" ? "#e16540" : "#b4232c" });
  await chrome.action.setBadgeText({ text: text.length > 4 ? "999+" : text });
}

/** Small snapshot for the dashboard (works even when the dashboard is opened on another device). */
export const snapshot = () => {
  const { state, done, total, current, lastError, backoffUntil, requestsToday, requestsDay, finishedAt, lastOkDay } = status;
  return { state, done, total, current, lastError, backoffUntil, requestsToday, requestsDay, finishedAt, lastOkDay };
};
