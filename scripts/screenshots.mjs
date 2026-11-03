// Captures the README screenshots from a running dashboard.
//   pnpm screenshots                                  # everything from http://localhost:3100
//   BASE=http://localhost:3100 APP_BASE=http://localhost:3101 APP_ID=1438388363 RUN_ID=<run> pnpm screenshots
// BASE serves the landing page + research; APP_BASE (defaults to BASE) serves the app, AI research and settings pages.
// RUN_ID: a finished AI research run on APP_BASE (adds the run graph and result shots).
// ONLY: comma-separated file names to capture just those, e.g. ONLY=ai-research.png
//
// The published images use a placeholder identity ("Tallyfinch") for the demo app on a scratch copy of the
// database, so no real app's name or icon appears: see apps/web/scripts/screenshot-db.ts.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const BASE = process.env.BASE ?? "http://localhost:3100";
const APP_BASE = process.env.APP_BASE ?? BASE;
const APP_ID = process.env.APP_ID;
const RUN_ID = process.env.RUN_ID;
const COUNTRY = process.env.COUNTRY ?? "us";
const SEED = process.env.SEED ?? "habit tracker";
const OUT = path.resolve(process.env.OUT ?? "docs/images");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
fs.mkdirSync(OUT, { recursive: true });

/** height: viewport height for this shot; scrollTo: CSS selector scrolled to the top (24 px margin) before capture */
const shots = [
  { file: "landing.png", url: `${BASE}/`, wait: 2500 },
  {
    file: "research.png",
    url: `${BASE}/research?seed=${encodeURIComponent(SEED)}&country=${COUNTRY}${APP_ID ? `&app=${APP_ID}` : ""}`,
    wait: 6000,
  },
  ...(APP_ID
    ? [
        { file: "app-dashboard.png", url: `${APP_BASE}/apps/${APP_ID}?country=${COUNTRY}`, wait: 2500 },
        { file: "competitors.png", url: `${APP_BASE}/apps/${APP_ID}/competitors?country=${COUNTRY}`, wait: 2000 },
      ]
    : []),
  ...(RUN_ID
    ? [
        { file: "ai-research.png", url: `${APP_BASE}/agent/${RUN_ID}`, wait: 3000, height: 1280 },
        { file: "ai-research-result.png", url: `${APP_BASE}/agent/${RUN_ID}`, wait: 3000, scrollTo: '[role="tablist"]' },
      ]
    : []),
  { file: "settings.png", url: `${APP_BASE}/settings`, wait: 2000 },
  { file: "extension.png", url: `${APP_BASE}/extension`, wait: 4000 },
].filter((s) => !ONLY || ONLY.has(s.file));

const browser = await puppeteer.launch({ headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
try {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  for (const s of shots) {
    const height = s.height ?? 900;
    await page.setViewport({ width: 1440, height, deviceScaleFactor: 2 });
    await page.goto(s.url, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // hide the dev-mode badge
    await new Promise((r) => setTimeout(r, s.wait));
    let y = 0;
    if (s.scrollTo) {
      y = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 24) : 0;
      }, s.scrollTo);
    }
    await page.screenshot({ path: path.join(OUT, s.file), clip: { x: 0, y, width: 1440, height } });
    console.log("✓", s.file, "←", s.url);
  }
} finally {
  await browser.close();
}
