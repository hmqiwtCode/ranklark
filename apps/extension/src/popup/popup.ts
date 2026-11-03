import type { Message, Reply, StatusReply } from "../shared/types";

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

async function render() {
  const r = await send<StatusReply>({ type: "status" });
  $("version").textContent = `v${r.version}`;
  $("pair").hidden = r.paired;
  $("main").hidden = !r.paired;
  const dot = $("dot");
  const s = r.status;
  dot.className = `dot ${s.state === "running" ? "run" : s.state === "error" || s.state === "backoff" ? "bad" : r.paired ? "ok" : ""}`;
  if (!r.paired) return;

  $("serverHost").textContent = new URL(r.server!).host;
  ($("open") as HTMLAnchorElement).href = `${r.server!}/apps`;
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
  } else if (s.lastOkDay === today) {
    headline = "All checked for today ✓";
    sub = `Finished ${ago(s.finishedAt)}.`;
  }
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
  await send({ type: "run" });
  render();
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
