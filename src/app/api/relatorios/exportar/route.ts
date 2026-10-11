import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { actorFromRequest } from "@/server/api-auth";
import { exportReport, parseConfig, type Format } from "@/server/reports/service";

// Só entrega o arquivo se ele foi reaberto e verificado. A organização vem da sessão + associação no banco.
export async function GET(req: NextRequest) {
  const actor = await actorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const format = req.nextUrl.searchParams.get("formato");
  if (format !== "pdf" && format !== "xlsx" && format !== "csv") return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  try {
    const config = parseConfig(Object.fromEntries([...req.nextUrl.searchParams.keys()].map((k) => [k, req.nextUrl.searchParams.getAll(k)])));
    const r = await exportReport(actor, config, format as Format);
    return new NextResponse(new Uint8Array(r.buffer), {
      headers: { "Content-Type": r.mime, "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "no-store", "X-Export-Verified": "true", "X-Export-SHA256": r.sha256 },
    });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.code === "forbidden" ? 403 : e.code === "not_found" ? 404 : 422 });
    logger.error("export_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha ao gerar o relatório." }, { status: 500 });
  }
}
