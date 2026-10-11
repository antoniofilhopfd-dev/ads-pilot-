import { NextResponse, type NextRequest } from "next/server";

// CSP com NONCE por requisição: scripts só executam se forem do próprio site (assinados pelo servidor).
// Substitui o CSP parcial anterior (sem script-src). Aplicado às páginas; APIs têm CSP próprio em next.config.ts.
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-request-id", req.headers.get("x-request-id") ?? crypto.randomUUID());
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Request-Id", headers.get("x-request-id")!);
  return res;
}

export const config = { matcher: [{ source: "/((?!api/|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }] };
