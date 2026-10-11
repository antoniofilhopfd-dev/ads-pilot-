import { NextRequest, NextResponse } from "next/server";
import { actorFromRequest } from "@/server/api-auth";
import { getLogo } from "@/server/services/logo";

// Serve a logo da organização ATIVA do usuário autenticado (nunca de outra). Cabeçalhos impedem que o arquivo
// seja interpretado como página/script mesmo se alguém conseguisse enviar conteúdo malicioso disfarçado.
export async function GET(req: NextRequest) {
  const actor = await actorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const logo = await getLogo(actor);
  if (!logo) return new NextResponse(null, { status: 404 });
  const etag = `"${logo.sha256}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline" };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(new Uint8Array(logo.data), { headers: { ...headers, "Content-Type": logo.mime, "Content-Length": String(logo.bytes) } });
}
