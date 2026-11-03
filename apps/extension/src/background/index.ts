/**
 * Background service worker (Chrome MV3).
 *
 * About once an hour (and on demand) it asks the user's own dashboard which of THEIR keywords/apps need checking,
 * fetches those from Apple in this browser (the user's own IP and rate limit), parses them with the same
 * @ranklark/core code the server uses, and posts each result back. Nothing else: no browsing data, no cookies
 * (every Apple request uses credentials: "omit"), never on behalf of other users.
 */
import type { Message } from "../shared/types";
import { handle } from "./messages";
import { tick } from "./run";
import { loadStatus } from "./state";

/** Re-armed on EVERY worker start: an interrupted run resumes within ~1 minute, not an hour. */
async function ensureAlarms() {
  if (!(await chrome.alarms.get("tick"))) await chrome.alarms.create("tick", { delayInMinutes: 1, periodInMinutes: 60 });
  const s = await loadStatus();
  if (s.state === "running" && !(await chrome.alarms.get("resume"))) await chrome.alarms.create("resume", { delayInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(() => void ensureAlarms());
chrome.runtime.onStartup.addListener(() => void ensureAlarms());
void ensureAlarms();

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tick") void tick("hourly check");
  if (a.name === "resume") void tick("resuming");
});

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  handle(msg, sender, false).then(sendResponse);
  return true;
});
chrome.runtime.onMessageExternal.addListener((msg: Message, sender, sendResponse) => {
  handle(msg, sender, true).then(sendResponse);
  return true;
});
