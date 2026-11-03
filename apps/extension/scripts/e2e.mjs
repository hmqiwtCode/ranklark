// End-to-end test of the REAL extension in Chrome for Testing (separate from your own Chrome/profile).
//   1. Expects a Ranklark server in extension mode at E2E_SERVER (it must never call Apple itself).
//   2. Seeds one app + keywords, loads apps/extension/dist, connects WITHOUT any login (by opening the
//      dashboard, or with E2E_CONNECT=popup by typing the address into the popup), then waits until the
//      extension has fetched from Apple and posted results back.
// Usage: E2E_SERVER=http://localhost:3101 [E2E_CONNECT=popup] E2E_APP=1438388363 node scripts/e2e.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist");
const server = process.env.E2E_SERVER ?? "http://localhost:3101";
const appId = process.env.E2E_APP ?? "1438388363";
const terms = (process.env.E2E_TERMS ?? "habit tracker,habit tracker widget").split(",");
const via = process.env.E2E_CONNECT === "popup" ? "popup" : "dashboard";
const shots = process.env.E2E_SHOTS ?? path.join(os.tmpdir(), "ranklark-e2e");
fs.mkdirSync(shots, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const api = (p, body) =>
  fetch(server + p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) =>
    r.json(),
  );

log("seed: app", appId, "keywords", terms.join(" | "));
log(" ", JSON.stringify(await api("/api/apps", { input: appId, country: "us" })));
log(" ", JSON.stringify(await api(`/api/apps/${appId}/keywords`, { terms, country: "us" })));
const before = await api("/api/ext/status");
log("mode:", before.mode, "· pending tasks:", before.pending);
if (before.mode !== "extension") throw new Error("server must run with ASO_FETCH_MODE=extension for this test");

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ranklark-chrome-"));
const browser = await puppeteer.launch({
  headless: true,
  userDataDir,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, "--no-first-run"],
});
try {
  const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/background.js"), {
    timeout: 20000,
  });
  const extId = new URL(swTarget.url()).host;
  log("extension loaded:", extId);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("console", (m) => m.type() === "error" && log("page console error:", m.text()));
  const popup = await browser.newPage();
  await popup.setViewport({ width: 340, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const paired = () => popup.evaluate(() => chrome.runtime.sendMessage({ type: "status" }).then((r) => r.paired));

  if (via === "popup") {
    // No-login path 1: type the dashboard address into the popup and click Connect.
    await popup.waitForSelector("#server", { visible: true });
    await popup.$eval(
      "#server",
      (el, v) => {
        el.value = v;
      },
      server,
    );
    await popup.click("#connect");
  } else {
    // No-login path 2 (default): just open the dashboard; it connects an installed extension by itself.
    await page.goto(`${server}/apps`, { waitUntil: "networkidle2" });
  }
  const t1 = Date.now();
  while (!(await paired())) {
    if (Date.now() - t1 > 20000) throw new Error(`pairing via ${via} failed`);
    await new Promise((r) => setTimeout(r, 500));
  }
  log(`paired via ${via} with zero login in ${Date.now() - t1} ms`);

  // wait for the run to finish
  const t0 = Date.now();
  let st;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      st = await api("/api/ext/status");
    } catch {
      continue;
    } // tolerate a dropped keep-alive socket
    const live = await popup.evaluate(
      () => `${document.getElementById("headline")?.textContent} | ${document.getElementById("sub")?.textContent}`,
    );
    log(`pending=${st.pending} lastBatch=${JSON.stringify(st.status?.lastBatch ?? null)} popup="${live}"`);
    if (st.pending === 0 && st.status) break;
    if (Date.now() - t0 > 6 * 60_000) throw new Error("timed out waiting for the extension run");
  }
  await popup.screenshot({ path: path.join(shots, "popup.png") });
  await page.goto(`${server}/extension`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(shots, "dashboard-extension.png"), fullPage: true });
  await page.goto(`${server}/apps/${appId}?country=us`, { waitUntil: "networkidle2" });
  await page.screenshot({ path: path.join(shots, "dashboard-app.png"), fullPage: true });
  log("done in", Math.round((Date.now() - t0) / 1000), "s · screenshots in", shots);
} finally {
  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
