import { NextRequest, NextResponse } from "next/server";
import { utmCsv } from "@/lib/utm";
import { actorFromRequest } from "@/server/api-auth";
import { listUtmLinks } from "@/server/library";

// Exporta o histórico de UTMs da organização ativa (somente leitura, GET sem efeitos colaterais).
export async function GET(req: NextRequest) {
  const actor = await actorFromRequest(req);
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const rows = await listUtmLinks(actor, 5000);
  return new NextResponse(utmCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="utm-historico.csv"', "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
