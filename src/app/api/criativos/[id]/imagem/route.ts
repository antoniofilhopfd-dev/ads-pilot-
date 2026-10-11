import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { actorFromRequest } from "@/server/api-auth";
import { creativeImage } from "@/server/library";

// Prévia da imagem de um criativo da organização ATIVA (respeita a visibilidade do ator). Cabeçalhos impedem execução como página.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await actorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const img = await creativeImage(actor, id);
    if (!img) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=300", "Content-Disposition": "inline" } });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(null, { status: 404 });
    throw e;
  }
}
