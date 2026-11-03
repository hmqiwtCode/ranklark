/**
 * Each connected browser is a DEVICE with its own revocable token (only a SHA-256 hash is stored).
 * There is no login: a device is created when the extension connects (POST /api/ext/connect) or when the
 * dashboard pairs it. The dashboard itself is single-user — put it behind your own auth before exposing it.
 */
import crypto from "node:crypto";
import { type DeviceStatus, TOKEN_PREFIX, TOKEN_RE, VERSION_HEADER } from "@ranklark/core/protocol";
import { db } from "@/server/db";

export type Device = {
  id: string;
  name: string | null;
  version: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen: string | null;
  status_json: string | null;
  revoked_at: string | null;
};
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Creates a device and returns its token ONCE (we only keep the hash). */
export function createDevice(name: string | null = null) {
  const id = crypto.randomUUID();
  const token = `${TOKEN_PREFIX}_${crypto.randomBytes(24).toString("base64url")}`;
  db.prepare("INSERT INTO ext_devices (id, token_hash, name) VALUES (?, ?, ?)").run(id, hash(token), name);
  return { id, token };
}

export function revokeDevice(id: string) {
  return db.prepare("UPDATE ext_devices SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(id).changes > 0;
}

export function listDevices() {
  return db.prepare("SELECT * FROM ext_devices WHERE revoked_at IS NULL ORDER BY COALESCE(last_seen, created_at) DESC").all() as Device[];
}

/** "Chrome 156 · macOS" from a User-Agent header. */
export function deviceName(ua: string | null) {
  if (!ua) return null;
  const browser = ua.match(/Edg\/(\d+)/)
    ? `Edge ${ua.match(/Edg\/(\d+)/)![1]}`
    : ua.match(/Chrome\/(\d+)/)
      ? `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}`
      : "Browser";
  const os = /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Linux/.test(ua)
          ? "Linux"
          : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Bearer token → active device (and records that it checked in). */
export function authDevice(req: Request): Device | null {
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!TOKEN_RE.test(given)) return null;
  const d = db.prepare("SELECT * FROM ext_devices WHERE token_hash = ? AND revoked_at IS NULL").get(hash(given)) as Device | undefined;
  if (!d) return null;
  const ua = req.headers.get("user-agent");
  const version = req.headers.get(VERSION_HEADER)?.slice(0, 20) ?? d.version;
  db.prepare(
    "UPDATE ext_devices SET last_seen = datetime('now'), version = ?, user_agent = COALESCE(?, user_agent), name = COALESCE(name, ?) WHERE id = ?",
  ).run(version, ua?.slice(0, 300) ?? null, deviceName(ua), d.id);
  return d;
}

export function saveDeviceStatus(deviceId: string, status: unknown) {
  if (!status || typeof status !== "object") return;
  const s = status as Record<string, unknown>;
  const clean: DeviceStatus = {
    state: ["idle", "running", "error", "backoff"].includes(String(s.state)) ? (s.state as DeviceStatus["state"]) : "idle",
    done: Number(s.done) || 0,
    total: Number(s.total) || 0,
    current: typeof s.current === "string" ? s.current.slice(0, 120) : undefined,
    lastError: typeof s.lastError === "string" ? s.lastError.slice(0, 300) : undefined,
    backoffUntil: Number(s.backoffUntil) || undefined,
    requestsToday: Number(s.requestsToday) || 0,
    requestsDay: typeof s.requestsDay === "string" ? s.requestsDay.slice(0, 10) : undefined,
    finishedAt: typeof s.finishedAt === "string" ? s.finishedAt.slice(0, 30) : undefined,
    lastOkDay: typeof s.lastOkDay === "string" ? s.lastOkDay.slice(0, 10) : undefined,
  };
  db.prepare("UPDATE ext_devices SET status_json = ? WHERE id = ?").run(JSON.stringify(clean), deviceId);
}

/** Bearer-token API, no cookies → safe to allow any origin (the extension's origin varies by install). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": `authorization, content-type, ${VERSION_HEADER}`,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
