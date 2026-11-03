import type { StoredEvent } from "@/features/agent/lib/contract";
import { subscribe } from "@/features/agent/server/bus";
import { getRunRow, listEvents } from "@/features/agent/server/store";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events: replays the run's stored events after ?after=N (or Last-Event-ID), then streams live ones.
 * Subscribes before replaying and drops anything at or below the last sent seq, so there are no gaps or dupes.
 * Closes after run.finished, or right away when the run already ended without one (interrupted).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!getRunRow(id)) return Response.json({ error: "Run not found." }, { status: 404 });
  const url = new URL(req.url);
  const after = Math.max(0, Math.floor(Number(url.searchParams.get("after") ?? req.headers.get("last-event-id") ?? 0)) || 0);
  const enc = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSeq = after;
      let replaying = true;
      const buffered: StoredEvent[] = [];
      const write = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          close();
        }
      };
      const send = (e: StoredEvent) => {
        if (closed || e.seq <= lastSeq) return;
        lastSeq = e.seq;
        write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
        if (e.type === "run.finished") close();
      };
      const unsubscribe = subscribe(id, (e) => (replaying ? buffered.push(e) : send(e)));
      const ping = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      function close() {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(ping);
        req.signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      stop = close;
      req.signal.addEventListener("abort", close);

      write("retry: 3000\n\n");
      for (const e of listEvents(id, after)) send(e);
      replaying = false;
      for (const e of buffered) send(e);
      if (!closed && getRunRow(id)?.status !== "running") close();
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
