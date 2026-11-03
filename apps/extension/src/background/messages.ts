/**
 * Message handling for the popup (internal) and a paired dashboard page (external, via externally_connectable).
 * A page may only connect the extension to ITSELF and can't take over a pairing with another dashboard;
 * pause/unpair are popup-only.
 */
import { TOKEN_RE } from "@ranklark/core/protocol";
import type { Config, Message, Reply } from "../shared/types";
import { run } from "./run";
import { connect, fetchTasks } from "./server";
import { clearConfig, getConfig, loadStatus, saveStatus, setConfig, VERSION } from "./state";

async function save(cfg: Config): Promise<Reply> {
  await setConfig(cfg);
  await saveStatus({ state: "idle", lastError: undefined });
  void run("just connected");
  return { ok: true };
}

const errorReply = (e: unknown): Reply => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function handle(msg: Message, sender: chrome.runtime.MessageSender, external: boolean): Promise<Reply> {
  const cfg = await getConfig();
  const senderOrigin = sender.origin ?? (sender.url ? new URL(sender.url).origin : "");
  const pairedOrigin = cfg ? new URL(cfg.server).origin : null;

  if (external) {
    if (msg.type === "pair") {
      if (!msg.server || new URL(msg.server).origin !== senderOrigin)
        return { ok: false, error: "A page can only connect the extension to its own dashboard." };
      if (pairedOrigin && pairedOrigin !== senderOrigin)
        return { ok: false, error: `Already connected to ${new URL(pairedOrigin).host}. Disconnect it in the extension popup first.` };
    } else if (msg.type !== "ping" && msg.type !== "run" && msg.type !== "status") {
      return { ok: false, error: "Not allowed from a web page." };
    } else if (msg.type !== "ping" && pairedOrigin !== senderOrigin) {
      return { ok: false, error: "This page is not the connected dashboard." };
    }
  }

  switch (msg.type) {
    case "ping":
      return {
        ok: true,
        version: VERSION,
        paired: !!cfg && (!external || pairedOrigin === senderOrigin),
        pairedElsewhere: external && !!cfg && pairedOrigin !== senderOrigin,
      };
    case "connect":
      try {
        return await save(await connect(msg.server));
      } catch (e) {
        return errorReply(e);
      }
    case "pair": {
      const server = (msg.server ?? "").trim().replace(/\/$/, "");
      const token = (msg.token ?? "").trim();
      if (!/^https?:\/\//.test(server) || !TOKEN_RE.test(token)) return { ok: false, error: "Server URL or key looks wrong." };
      try {
        await fetchTasks({ server, token }); // proves the key works before saving it
      } catch (e) {
        return errorReply(e);
      }
      return save({ server, token });
    }
    case "run":
      if (!cfg) return { ok: false, error: "Not connected yet." };
      if (!external) await saveStatus({ hostBackoff: {}, backoffUntil: undefined }); // the user explicitly asked from the popup
      void run("run now");
      return { ok: true };
    case "status":
      return { ok: true, status: await loadStatus(), paired: !!cfg, server: cfg?.server ?? null, paused: !!cfg?.paused, version: VERSION };
    case "pause":
      if (!cfg) return { ok: false };
      await setConfig({ ...cfg, paused: msg.paused });
      return { ok: true };
    case "unpair":
      await clearConfig();
      await saveStatus({ state: "idle", lastError: undefined });
      return { ok: true };
    default:
      return { ok: false, error: "unknown message" };
  }
}
