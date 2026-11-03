import { STOREFRONTS } from "@ranklark/core/apple";
import type { Message, PageApp, Reply, StatusReply } from "../shared/types";

/** Toolbar popup: connect by dashboard address (no login), show progress, run/pause/disconnect. */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T = Reply>(msg: Message) => chrome.runtime.sendMessage(msg) as Promise<T>;

function ago(iso?: string) {
  if (!iso) return "—";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

let note: { text: string; until: number } | null = null;
let hereStarted = false;
function showNote(text: string, ms = 6000) {
  note = { text, until: Date.now() + ms };
  void render();
}

async function render() {
  let r: StatusReply;
  try {
    r = await send<StatusReply>({ type: "status" });
  } catch {
    return; // background worker still starting; the 1 s timer retries
  }
  $("loading").hidden = true;
  $("version").textContent = `v${r.version}`;
  $("pair").hidden = r.paired;
  $("main").hidden = !r.paired;
  const dot = $("dot");
  const s = r.status;
  dot.className = `dot ${s.state === "running" ? "run" : s.state === "error" || s.state === "backoff" ? "bad" : r.paired ? "ok" : ""}`;
  if (!r.paired) return;

  if (!hereStarted) {
    hereStarted = true;
    void initHere(r.server!);
  }
  $("serverHost").textContent = new URL(r.server!).host;
  ($("open") as HTMLAnchorElement).href = `${r.server!}/apps`;
  ($("addKw") as HTMLAnchorElement).href = `${r.server!}/apps`;
  $("pause").textContent = r.paused ? "Resume" : "Pause";
  const today = new Date().toISOString().slice(0, 10);
  let headline = "Waiting for the next check";
  let sub = "Checks run automatically about once an hour while Chrome is open.";
  if (r.paused) {
    headline = "Paused";
    sub = "No requests will be sent until you resume.";
  } else if (s.state === "running") {
    headline = s.current ?? "Checking…";
    sub = `${s.done} of ${s.total} done · ~15 s per keyword (gentle on Apple)`;
  } else if (s.state === "backoff") {
    headline = "Apple asked us to slow down";
    sub = `That Apple server resumes automatically at ${new Date(s.backoffUntil ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  } else if (s.tracked === 0) {
    headline = "No keywords tracked yet";
    sub = "Add your app and some keywords in the dashboard. The extension then checks them automatically.";
  } else if (s.lastOkDay === today) {
    headline = "All checked for today ✓";
    sub = `Finished ${ago(s.finishedAt)}.`;
  }
  $("addKw").hidden = s.tracked !== 0 || s.state === "running";
  $("note").hidden = !note || Date.now() > note.until;
  $("note").textContent = note?.text ?? "";
  $("headline").textContent = headline;
  $("sub").textContent = sub;
  $("barWrap").hidden = s.state !== "running";
  $("bar").style.width = `${(s.done / Math.max(1, s.total)) * 100}%`;
  const err = $("err");
  err.hidden = !s.lastError;
  err.textContent = s.lastError ?? "";
  $("reqs").textContent = String(s.requestsDay === today ? s.requestsToday : 0);
  $("last").textContent = ago(s.finishedAt);
  $("counts").textContent = s.last ? `${s.last.serp} kw · ${s.last.hints} pop` : "—";
  ($("run") as HTMLButtonElement).disabled = s.state === "running" || r.paused;
}

$("connect").addEventListener("click", async () => {
  const btn = $("connect") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Connecting…";
  const r = await send({ type: "connect", server: ($("server") as HTMLInputElement).value });
  btn.disabled = false;
  btn.textContent = "Connect";
  const e = $("pairError");
  e.hidden = r.ok;
  e.textContent = r.error ?? "";
  render();
});
$("run").addEventListener("click", async () => {
  const btn = $("run") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Checking…";
  const r = await send<Reply & { due?: number; tracked?: number | null }>({ type: "run" });
  btn.textContent = "Run now";
  if (!r.ok) showNote(r.error ?? "Couldn't reach the dashboard.");
  else if (r.tracked === 0) showNote("Nothing to check: no keywords are tracked yet.");
  else if (!r.due) showNote("Nothing due: every keyword already has today's results.");
  else showNote(`Checking ${r.due} item${r.due === 1 ? "" : "s"} now, about 15 s each to stay gentle on Apple.`);
});
$("pause").addEventListener("click", async () => {
  const r = await send<StatusReply>({ type: "status" });
  await send({ type: "pause", paused: !r.paused });
  render();
});
$("unpair").addEventListener("click", async () => {
  await send({ type: "unpair" });
  render();
});

render();
setInterval(render, 1000);

// ---------------------------------------------------------------- "Track this app" on App Store pages

/** apps.apple.com/{cc}/app/{slug}/id{N} → app id + storefront (host permission lets us read this tab's URL). */
function appFromUrl(url: string | undefined): { appId: number; country: string } | null {
  const m = url?.match(/^https:\/\/apps\.apple\.com\/([a-z]{2})\/app\/(?:[^/?#]+\/)?id(\d+)/);
  return m ? { appId: Number(m[2]), country: m[1] } : null;
}

function showHere(app: PageApp, server: string) {
  const sf = STOREFRONTS[app.country];
  $("hereCountry").textContent = sf ? `${sf.flag} ${sf.name}` : app.country.toUpperCase();
  if (app.name && !app.name.startsWith("App ")) $("hereName").textContent = app.name;
  $("hereState").textContent = app.tracked
    ? app.keywords.length
      ? `Tracked · ${app.keywords.length} keyword${app.keywords.length === 1 ? "" : "s"}: ${app.keywords.slice(0, 4).join(", ")}${app.keywords.length > 4 ? "…" : ""}`
      : "Tracked · no keywords yet. Add some below."
    : "Not tracked yet.";
  $("hereTrack").textContent = app.tracked ? "Add keywords" : "Track this app";
  const open = $("hereOpen") as HTMLAnchorElement;
  open.hidden = !app.tracked;
  open.href = `${server}/apps/${app.appId}?country=${app.country}`;
}

async function initHere(server: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const page = appFromUrl(tab?.url);
  if (!page) return;
  if (!STOREFRONTS[page.country]) page.country = "us"; // storefront not supported yet → closest default
  $("here").hidden = false;
  $("hereName").textContent = (tab?.title ?? "This app").replace(/\s+[-–|]\s+.*$/, "").replace(/ (on|trên) (the )?App Store.*$/i, "");
  const r = await send<Reply & { app?: PageApp }>({ type: "pageApp", ...page });
  if (r.ok && r.app) showHere(r.app, server);
  else $("hereState").textContent = r.error ?? "Couldn't reach the dashboard.";

  $("hereTrack").addEventListener("click", async () => {
    const btn = $("hereTrack") as HTMLButtonElement;
    const input = $("hereTerms") as HTMLInputElement;
    const terms = input.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    btn.disabled = true;
    btn.textContent = "Saving…";
    const res = await send<Reply & { app?: PageApp }>({ type: "track", ...page, terms });
    btn.disabled = false;
    if (!res.ok || !res.app) {
      btn.textContent = "Try again";
      showNote(res.error ?? "Couldn't reach the dashboard.");
      return;
    }
    input.value = "";
    showHere(res.app, server);
    showNote(
      res.app.added
        ? `Added ${res.app.added} keyword${res.app.added === 1 ? "" : "s"}. Checking now, about 15 s each.`
        : res.app.keywords.length
          ? "App tracked. Checking it now."
          : "App tracked. Add keywords to see where it ranks.",
    );
  });
}
