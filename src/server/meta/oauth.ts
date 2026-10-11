// Troca/renovação de token da Meta. NÃO validado contra a Meta real (sem app/credenciais): testado com servidor simulado.
// O token vai no CORPO do POST (nunca na URL) e nunca é registrado em log.
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { metaConnections } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { audit } from "../audit";
import { GRAPH_VERSION, mapGraphError } from "./graph-provider";
import { MetaApiError } from "./types";

export type Creds = { appId: string; appSecret: string };
export const metaCreds = (env: Record<string, string | undefined> = process.env): Creds | null => (env.META_APP_ID && env.META_APP_SECRET ? { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET } : null);

export async function exchangeLongLived(token: string, creds: Creds, fetchImpl: typeof fetch = fetch, base = `https://graph.facebook.com/${GRAPH_VERSION}`): Promise<{ token: string; expiresIn: number | null }> {
  let res: Response;
  try {
    res = await fetchImpl(`${base}/oauth/access_token`, { method: "POST", body: new URLSearchParams({ grant_type: "fb_exchange_token", client_id: creds.appId, client_secret: creds.appSecret, fb_exchange_token: token }), signal: AbortSignal.timeout(15_000) });
  } catch { throw new MetaApiError("transient", "Falha de rede ao renovar o token."); }
  const body = (await res.json().catch(() => undefined)) as { access_token?: string; expires_in?: number; error?: unknown } | undefined;
  if (!res.ok || !body?.access_token) throw mapGraphError(res.status, body as Record<string, unknown> | undefined);
  return { token: body.access_token, expiresIn: typeof body.expires_in === "number" ? body.expires_in : null };
}

export const RENEW_WITHIN_DAYS = 10;

// Renova tokens que expiram em breve. Falha de renovação NÃO derruba a conexão (o token antigo segue válido até expirar),
// exceto quando a Meta diz que ele já é inválido (190) → "reconexão necessária".
export async function renewExpiringTokens(opts: { now?: Date; fetchImpl?: typeof fetch; creds?: Creds | null; base?: string } = {}) {
  const now = opts.now ?? new Date();
  const creds = opts.creds === undefined ? metaCreds() : opts.creds;
  const out = { renewed: 0, failed: 0, skipped: 0 };
  const rows = await db.select().from(metaConnections).where(and(eq(metaConnections.mode, "meta"), eq(metaConnections.status, "active"), isNotNull(metaConnections.tokenExpiresAt), lte(metaConnections.tokenExpiresAt, new Date(now.getTime() + RENEW_WITHIN_DAYS * 86_400_000))));
  for (const c of rows) {
    if (!creds || !c.tokenEnc) { out.skipped++; continue; }
    try {
      const r = await exchangeLongLived(decryptSecret(c.tokenEnc), creds, opts.fetchImpl, opts.base);
      await db.update(metaConnections).set({ tokenEnc: encryptSecret(r.token), tokenExpiresAt: r.expiresIn ? new Date(now.getTime() + r.expiresIn * 1000) : c.tokenExpiresAt, lastError: null }).where(eq(metaConnections.id, c.id));
      await audit({ organizationId: c.organizationId, userId: null, action: "meta.token_renewed", objectType: "meta_connection", objectId: c.id, after: { expiresInDays: r.expiresIn ? Math.round(r.expiresIn / 86_400) : null }, result: "success" });
      out.renewed++;
    } catch (e) {
      out.failed++;
      const err = e instanceof MetaApiError ? e : new MetaApiError("unknown", "erro");
      if (err.kind === "token_expired") await db.update(metaConnections).set({ status: "needs_reconnect", lastError: err.message.slice(0, 300) }).where(eq(metaConnections.id, c.id));
      else await db.update(metaConnections).set({ lastError: `Renovação do token falhou: ${err.message}`.slice(0, 300) }).where(eq(metaConnections.id, c.id));
      await audit({ organizationId: c.organizationId, userId: null, action: "meta.token_renew_failed", objectType: "meta_connection", objectId: c.id, result: "failure", error: err.kind });
      logger.warn("meta_token_renew_failed", { connectionId: c.id, kind: err.kind });
    }
  }
  return out;
}
