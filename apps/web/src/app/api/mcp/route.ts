import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/features/agent/server/mcp";
import { checkMcpAuth, mcpUrl, sameOrigin } from "@/features/agent/server/settings";

export const dynamic = "force-dynamic";

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }, { status, headers });

/**
 * MCP Streamable HTTP endpoint for the user's own Claude Code (stateless, JSON responses).
 * Bearer token from Settings (stored as a hash) and same-origin Origin checks guard it.
 */
export async function POST(req: Request) {
  // DNS-rebinding / cross-site defence: a browser page on another origin must not reach this endpoint
  if (!sameOrigin(req)) return rpcError(403, "Cross-origin requests are not allowed.");
  const denied = checkMcpAuth(req);
  if (denied) return rpcError(denied.status, denied.error, denied.status === 401 ? { "WWW-Authenticate": 'Bearer realm="ranklark"' } : {});

  const origin = mcpUrl(req).replace(/\/api\/mcp$/, "");
  const server = createMcpServer(origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // a stateless transport serves exactly one request; the JSON response is complete at this point
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  }
}

/** No server-initiated stream in stateless mode. */
function notAllowed(req: Request) {
  if (!sameOrigin(req)) return rpcError(403, "Cross-origin requests are not allowed.");
  return rpcError(405, "Method not allowed.", { Allow: "POST" });
}
export const GET = notAllowed;
export const DELETE = notAllowed;
