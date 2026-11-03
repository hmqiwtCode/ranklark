"use client";

import { useEffect } from "react";
import { connectThisBrowser, extSend, type Ping } from "@/features/extension/messaging";

const ATTEMPT_KEY = "ext-auto-connect-attempted";

/**
 * Zero-click setup: if the extension is installed in this browser but not connected to any dashboard,
 * connect it to this one. Runs once per browser session; never takes over a pairing with another dashboard.
 */
export function ExtensionAutoConnect() {
  useEffect(() => {
    let attempted = false;
    try {
      attempted = sessionStorage.getItem(ATTEMPT_KEY) === "1";
      sessionStorage.setItem(ATTEMPT_KEY, "1");
    } catch {
      // storage blocked: still try once per page load
    }
    if (attempted) return;
    void (async () => {
      const ping = await extSend<Ping>({ type: "ping" }, 1500);
      if (ping?.ok && !ping.paired && !ping.pairedElsewhere) await connectThisBrowser();
    })();
  }, []);
  return null;
}
