/** Data for the dashboard's Extension page: devices, today's coverage, 14-day activity, live feed. */
import { type DeviceStatus, EXT_DAILY_CAP, EXT_PACING } from "@ranklark/core";
import { db, today } from "@/server/db";
import { listDevices } from "./devices";
import { buildTasks, trackedPairs } from "./tasks";

export type ExtEvent = {
  id: number;
  at: string;
  device_id: string | null;
  kind: string;
  country: string | null;
  term: string | null;
  detail: Record<string, unknown>;
};

export function extOverview() {
  const day = today();
  const devices = listDevices().map((d) => {
    const st = d.status_json ? (JSON.parse(d.status_json) as DeviceStatus) : null;
    const t = db.prepare("SELECT kind, COUNT(*) n FROM ext_events WHERE device_id = ? AND date(at) = ? GROUP BY kind").all(d.id, day) as {
      kind: string;
      n: number;
    }[];
    const by = Object.fromEntries(t.map((x) => [x.kind, x.n]));
    return {
      id: d.id,
      name: d.name ?? "Chrome (not seen yet)",
      version: d.version,
      createdAt: d.created_at,
      lastSeen: d.last_seen,
      status: st,
      requestsToday: st && st.requestsDay === day ? st.requestsToday : 0,
      today: { serp: by.serp ?? 0, hints: by.hints ?? 0, apps: by.apps ?? 0, errors: by.error ?? 0 },
    };
  });

  const pairs = trackedPairs();
  const haveToday = db.prepare("SELECT 1 FROM serp WHERE term = ? AND country = ? AND day = ?");
  const checkedToday = pairs.filter((p) => haveToday.get(p.term, p.country, day)).length;

  // last 14 days of activity (UTC days)
  const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare("SELECT date(at) d, kind, COUNT(*) n FROM ext_events WHERE date(at) >= ? GROUP BY d, kind").all(since) as {
    d: string;
    kind: string;
    n: number;
  }[];
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
    const get = (k: string) => rows.find((r) => r.d === d && r.kind === k)?.n ?? 0;
    return { day: d, serp: get("serp"), hints: get("hints"), apps: get("apps"), errors: get("error") };
  });

  // today, by UTC hour
  const hrs = db
    .prepare("SELECT CAST(strftime('%H', at) AS INTEGER) h, COUNT(*) n FROM ext_events WHERE date(at) = ? AND kind != 'error' GROUP BY h")
    .all(day) as { h: number; n: number }[];
  const hours = Array.from({ length: 24 }, (_, h) => hrs.find((x) => x.h === h)?.n ?? 0);

  const events = (
    db.prepare("SELECT * FROM ext_events ORDER BY id DESC LIMIT 40").all() as (Omit<ExtEvent, "detail"> & { detail: string })[]
  ).map((e) => ({ ...e, detail: JSON.parse(e.detail ?? "{}") }));

  return {
    day,
    devices,
    tracked: pairs.length,
    checkedToday,
    pending: buildTasks().length,
    requestsToday: devices.reduce((a, d) => a + d.requestsToday, 0),
    cap: EXT_DAILY_CAP,
    pacing: EXT_PACING,
    days,
    hours,
    events,
  };
}
