/**
 * Schema migrations, applied in order and tracked with SQLite's `PRAGMA user_version`.
 *
 * To change the schema: APPEND a new entry (never edit a shipped one). Each runs once, inside a transaction.
 * Migration 1 uses IF NOT EXISTS so databases created before versioning upgrade cleanly.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "initial schema",
    sql: `
    CREATE TABLE IF NOT EXISTS apps (
      id            INTEGER PRIMARY KEY,         -- App Store trackId
      bundle_id     TEXT,
      name          TEXT NOT NULL,
      subtitle      TEXT,                        -- Lookup API has none: from ASC, the web catalog proxy, or manual
      subtitle_source TEXT,                      -- 'asc' | 'web' | 'manual'
      chart_json    TEXT,                        -- category chart position from the web catalog proxy
      seller        TEXT,
      icon          TEXT,
      genre         TEXT,
      genre_id      INTEGER,
      rating        REAL,
      rating_count  INTEGER,
      price         REAL,
      version       TEXT,
      released_at   TEXT,
      url           TEXT,
      description   TEXT,
      keywords_field TEXT,                       -- the hidden 100-char field (ASC or manual)
      keywords_source TEXT,                      -- 'asc' | 'manual' | NULL
      primary_country TEXT NOT NULL DEFAULT 'us',
      is_mine       INTEGER NOT NULL DEFAULT 1,
      added_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id     INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      country    TEXT NOT NULL,
      term       TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT 'manual',  -- manual | hints | competitor | metadata
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_id, country, term)
    );

    -- one row per (term, country, day): the SERP snapshot + derived scores
    CREATE TABLE IF NOT EXISTS serp (
      term         TEXT NOT NULL,
      country      TEXT NOT NULL,
      day          TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      top_json     TEXT NOT NULL,                -- top 10 apps [{id,name,icon,ratingCount,rating,seller,titleMatch}]
      ids_json     TEXT NOT NULL,                -- iTunes Search API order (≤200)
      web_json     TEXT,                         -- apps.apple.com web search order (top ~12) [{id,title,subtitle}]
      difficulty   REAL,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (term, country, day)
    );

    -- popularity has its own table because it can come from several sources
    CREATE TABLE IF NOT EXISTS popularity (
      term       TEXT NOT NULL,
      country    TEXT NOT NULL,
      source     TEXT NOT NULL,                  -- 'apple_ads' | 'hints_estimate'
      value      REAL,                           -- NULL = no signal (never a fake default)
      detail     TEXT,                           -- JSON: how it was computed
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (term, country, source)
    );

    CREATE TABLE IF NOT EXISTS ranks (
      app_id   INTEGER NOT NULL,
      country  TEXT NOT NULL,
      term     TEXT NOT NULL,
      day      TEXT NOT NULL,
      rank     INTEGER,                          -- displayed rank (web order when in top 12, else API position)
      rank_web INTEGER,                          -- position on apps.apple.com search (NULL = not in top ~12 / disabled)
      rank_api INTEGER,                          -- position in iTunes Search API results (NULL = not in top 200)
      approx   INTEGER NOT NULL DEFAULT 0,       -- 1 when rank comes from the API beyond the web window
      PRIMARY KEY (app_id, country, term, day)
    );

    -- metadata history → change markers on charts ("Impact" view)
    CREATE TABLE IF NOT EXISTS metadata_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id      INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      country     TEXT NOT NULL,
      version     TEXT,
      name        TEXT,
      subtitle    TEXT,
      keywords_field TEXT,
      description_hash TEXT,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- every App Store Connect localization (name/subtitle/keywords per locale)
    CREATE TABLE IF NOT EXISTS localizations (
      app_id     INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      locale     TEXT NOT NULL,
      name       TEXT,
      subtitle   TEXT,
      keywords   TEXT,
      version    TEXT,
      version_state TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (app_id, locale)
    );

    -- autocomplete responses, reused across terms that share a prefix (cuts Apple requests a lot)
    CREATE TABLE IF NOT EXISTS hints_cache (
      prefix  TEXT NOT NULL,
      country TEXT NOT NULL,
      day     TEXT NOT NULL,
      json    TEXT NOT NULL,
      PRIMARY KEY (prefix, country, day)
    );

    -- landing-page live showcase (real data, rebuilt every few days)
    CREATE TABLE IF NOT EXISTS showcase (
      seed     TEXT NOT NULL,
      country  TEXT NOT NULL,
      built_at TEXT NOT NULL DEFAULT (datetime('now')),
      json     TEXT NOT NULL,
      PRIMARY KEY (seed, country)
    );

    -- one row per connected Chrome install; only a hash of its token is stored
    CREATE TABLE IF NOT EXISTS ext_devices (
      id          TEXT PRIMARY KEY,
      token_hash  TEXT NOT NULL UNIQUE,
      name        TEXT,
      version     TEXT,
      user_agent  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen   TEXT,
      status_json TEXT,
      revoked_at  TEXT
    );

    -- what the extension did, for the activity feed and charts (pruned to recent history)
    CREATE TABLE IF NOT EXISTS ext_events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      at        TEXT NOT NULL DEFAULT (datetime('now')),
      device_id TEXT,
      kind      TEXT NOT NULL,                  -- serp | hints | apps | error
      country   TEXT,
      term      TEXT,
      detail    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ext_events_at ON ext_events(at);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ranks_app ON ranks(app_id, country, day);
    CREATE INDEX IF NOT EXISTS idx_keywords_app ON keywords(app_id, country);
`,
  },
];
