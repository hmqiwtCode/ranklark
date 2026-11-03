import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations";

/**
 * Single-file SQLite store. Everything an ASO run produces is append-only
 * (rank snapshots, keyword stats, metadata snapshots) so history is never lost.
 * Swap for Postgres/Supabase when this becomes multi-user — the SQL is portable.
 */
const DB_PATH = process.env.ASO_DB_PATH ?? path.join(process.cwd(), "data", "aso.db");

declare global {
  // eslint-disable-next-line no-var
  var __asoDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

globalThis.__asoDb ??= open();
export const db: Database.Database = globalThis.__asoDb;
// Runs on every module evaluation, not only when the connection opens: `next dev` keeps the connection on
// globalThis across hot reloads, and a migration appended meanwhile must still apply. No-op when current.
migrate(db);

function migrate(db: Database.Database) {
  if ((db.pragma("user_version", { simple: true }) as number) >= MIGRATIONS.length) return;
  // IMMEDIATE takes the write lock before reading the version, so parallel processes (e.g. `next build`
  // workers on a fresh file) can't both apply the same migration.
  db.transaction(() => {
    const current = db.pragma("user_version", { simple: true }) as number;
    MIGRATIONS.slice(current).forEach((m, i) => {
      db.exec(m.sql);
      db.pragma(`user_version = ${current + i + 1}`);
    });
  }).immediate();
}

export const today = () => new Date().toISOString().slice(0, 10);

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
