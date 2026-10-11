import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { createMcpServer } from "@/server/mcp/server";
import { authenticateMcp } from "@/server/mcp/tokens";

// Endpoint MCP (Streamable HTTP, sem estado). Autenticação por token Bearer a CADA requisição.
// Não há GET/SSE nem sessões: cada POST é independente (compatível com hospedagem Node simples).
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
const MAX_BODY = 100_000;

export async function POST(req: Request) {
  const requestId = randomUUID();
  // Proteção contra uso a partir de páginas web de terceiros (DNS rebinding / CSRF): clientes MCP não enviam Origin.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.APP_URL ?? "http://localhost:3000").origin) return json(403, { error: "Origin não permitido." });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json(413, { error: "Requisição grande demais." });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!checkRateLimit(`mcp-ip:${ip}`, 600, 60_000)) return json(429, { error: "Muitas requisições." }, { "Retry-After": "60" });
  try {
    const auth = await authenticateMcp(req.headers.get("authorization"), requestId);
    const server = createMcpServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    res.headers.set("X-Request-Id", requestId);
    return res;
  } catch (e) {
    if (e instanceof AppError && e.code === "unauthenticated") {
      if (!checkRateLimit(`mcp-authfail:${ip}`, 30, 60_000)) return json(429, { error: "Muitas tentativas inválidas." }, { "Retry-After": "60" });
      return json(401, { error: e.message }, { "WWW-Authenticate": 'Bearer realm="adspilot-mcp"' });
    }
    logger.error("mcp_request_failed", { requestId, error: e instanceof Error ? e.message : String(e) });
    return json(500, { error: "Erro interno." });
  }
}

const notAllowed = () => json(405, { error: "Método não suportado. Use POST (Streamable HTTP sem estado)." }, { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
