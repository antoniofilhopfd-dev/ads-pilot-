import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GRAPH_VERSION } from "@/server/meta/graph-provider";
import { assertCan } from "@/server/context";
import { requireActor } from "@/server/session";

// Início do OAuth (Facebook Login). NÃO validado contra a Meta real (sem app configurado).
export async function GET() {
  const { actor } = await requireActor();
  assertCan(actor, "meta.connect");
  const appId = process.env.META_APP_ID;
  if (!appId || !process.env.META_APP_SECRET) return NextResponse.redirect(new URL("/app/integracoes?erro=App%20da%20Meta%20n%C3%A3o%20configurado", process.env.APP_URL));
  const state = randomBytes(24).toString("base64url");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: `${process.env.APP_URL}/api/meta/oauth/callback`, state, scope: "ads_read", response_type: "code" }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("ap_meta_state", `${state}.${actor.organizationId}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/meta/oauth" });
  return res;
}
