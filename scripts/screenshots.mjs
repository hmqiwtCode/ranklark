// Captures the README screenshots from a running dashboard.
//   pnpm screenshots                                  # everything from http://localhost:3100
//   BASE=http://localhost:3100 APP_BASE=http://localhost:3101 APP_ID=1438388363 pnpm screenshots
// BASE serves the landing page + research; APP_BASE (defaults to BASE) serves the app pages.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const BASE = process.env.BASE ?? "http://localhost:3100";
const APP_BASE = process.env.APP_BASE ?? BASE;
const APP_ID = process.env.APP_ID;
const COUNTRY = process.env.COUNTRY ?? "us";
const SEED = process.env.SEED ?? "habit tracker";
const OUT = path.resolve(process.env.OUT ?? "docs/images");
fs.mkdirSync(OUT, { recursive: true });

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
  { file: "extension.png", url: `${APP_BASE}/extension`, wait: 4000 },
];

const browser = await puppeteer.launch({ headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  for (const s of shots) {
    await page.goto(s.url, { waitUntil: "networkidle2", timeout: 60_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // hide the dev-mode badge
    await new Promise((r) => setTimeout(r, s.wait));
    await page.screenshot({ path: path.join(OUT, s.file), clip: { x: 0, y: 0, width: 1440, height: 900 } });
    console.log("✓", s.file, "←", s.url);
  }
} finally {
  await browser.close();
}
