"use client";

import { EXTENSION_ID } from "@/features/extension/extension-id";

type ChromeRuntime = { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: unknown };

/**
 * Message the Ranklark extension from a dashboard page. Chrome only exposes `chrome.runtime` to pages
 * listed in the extension's externally_connectable.matches — so null means "not installed / not allowed here".
 */
export function extSend<T>(msg: unknown, timeoutMs = 4000): Promise<T | null> {
  const rt = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  if (!rt?.sendMessage) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, msg, (r) => {
        clearTimeout(t);
        resolve(rt.lastError ? null : ((r as T) ?? null));
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

export type Ping = { ok: boolean; version: string; paired: boolean; pairedElsewhere?: boolean };

/**
 * Connect the extension in THIS browser to THIS dashboard: no login, nothing to copy.
 * The dashboard mints a device key and hands it to the extension; the key is deleted again if pairing fails.
 */
export async function connectThisBrowser(): Promise<{ ok: boolean; error?: string }> {
  const dev = (await fetch("/api/ext/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) =>
    r.json(),
  )) as { id: string; token: string };
  const r = await extSend<{ ok: boolean; error?: string }>({ type: "pair", server: window.location.origin, token: dev.token }, 15000);
  if (!r?.ok) await fetch(`/api/ext/devices/${dev.id}`, { method: "DELETE" });
  return r ?? { ok: false, error: "The extension didn't answer. Reload this page and try again." };
}
