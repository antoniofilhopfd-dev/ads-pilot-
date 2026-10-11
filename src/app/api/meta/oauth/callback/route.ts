import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { connectWithToken } from "@/server/meta/connection";
import { GRAPH_VERSION } from "@/server/meta/graph-provider";
import { requireActor } from "@/server/session";

// Callback do OAuth. NÃO validado contra a Meta real. O token nunca é exibido nem registrado em log.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/integracoes?${q}`, process.env.APP_URL));
  const { actor } = await requireActor();
  const stored = req.cookies.get("ap_meta_state")?.value;
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const redirect = (r: NextResponse) => { r.cookies.delete({ name: "ap_meta_state", path: "/api/meta/oauth" }); return r; };

  // state valida CSRF e amarra o retorno à mesma organização que iniciou o fluxo
  if (!stored || !state || stored !== `${state}.${actor.organizationId}`) return redirect(back("erro=" + encodeURIComponent("Sessão de autorização inválida. Tente novamente.")));
  if (req.nextUrl.searchParams.get("error") || !code) return redirect(back("erro=" + encodeURIComponent("Autorização negada ou cancelada.")));
  try {
    const body = (extra: Record<string, string>) => new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, ...extra });
    const short = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, { method: "POST", body: body({ redirect_uri: `${process.env.APP_URL}/api/meta/oauth/callback`, code }) });
    const sj = (await short.json()) as { access_token?: string };
    if (!short.ok || !sj.access_token) throw new AppError("validation", "A Meta não concedeu o acesso.");
    // troca por token de longa duração (~60 dias)
    const long = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, { method: "POST", body: body({ grant_type: "fb_exchange_token", fb_exchange_token: sj.access_token }) });
    const lj = (await long.json()) as { access_token?: string; expires_in?: number };
    const token = long.ok && lj.access_token ? lj.access_token : sj.access_token;
    await connectWithToken(actor, token, long.ok ? lj.expires_in ?? null : null);
    return redirect(back("ok=1"));
  } catch (e) {
    logger.error("meta_oauth_failed", { error: e instanceof Error ? e.message : String(e) });
    return redirect(back("erro=" + encodeURIComponent(e instanceof AppError ? e.message : "Não foi possível concluir a conexão com a Meta.")));
  }
}
