import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, clients, metaConnections } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit } from "../audit";
import { accountCond, assertCan, type Actor } from "../context";
import { DemoProvider } from "./demo-provider";
import { GraphApiProvider } from "./graph-provider";
import { MetaApiError, type MetaProvider } from "./types";

export const REQUIRED_SCOPES = ["ads_read"]; // Etapa 03 é somente leitura. ads_management só na Etapa 04.

export async function getConnection(actor: Actor) {
  assertCan(actor, "insights.read");
  const [c] = await db.select().from(metaConnections).where(eq(metaConnections.organizationId, actor.organizationId)).limit(1);
  return c ?? null;
}

// O token só é descriptografado aqui, no servidor, no momento do uso.
export function providerFor(conn: typeof metaConnections.$inferSelect): MetaProvider {
  if (conn.mode === "demo") return new DemoProvider(conn.organizationId);
  if (!conn.tokenEnc) throw new AppError("conflict", "Conexão sem token. Reconecte a Meta.");
  return new GraphApiProvider(decryptSecret(conn.tokenEnc));
}

export async function connectDemo(actor: Actor) {
  assertCan(actor, "meta.connect");
  if (await getConnection(actor)) throw new AppError("conflict", "Já existe uma conexão. Desconecte antes de ativar o modo demonstração.");
  const id = randomUUID();
  await db.insert(metaConnections).values({ id, organizationId: actor.organizationId, mode: "demo", status: "active", connectedBy: actor.userId });
  await discoverAccounts(actor);
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "meta.connect_demo", objectType: "meta_connection", objectId: id, result: "success", requestId: actor.requestId });
}

// Chamado pelo callback OAuth depois de trocar o `code` pelo token. (Não validado contra a Meta real.)
export async function connectWithToken(actor: Actor, token: string, expiresInSeconds: number | null, provider: MetaProvider = new GraphApiProvider(token)) {
  assertCan(actor, "meta.connect");
  const existing = await getConnection(actor);
  if (existing?.mode === "demo") throw new AppError("conflict", "Desconecte o modo demonstração antes de conectar a Meta.");
  let accounts;
  try {
    accounts = await provider.listAdAccounts(); // valida o token e as permissões de verdade
  } catch (e) {
    if (e instanceof MetaApiError) throw new AppError("validation", `A Meta recusou a conexão: ${e.message}`);
    throw e;
  }
  const values = {
    mode: "meta" as const, status: "active" as const, tokenEnc: encryptSecret(token), lastError: null,
    tokenExpiresAt: expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null,
    grantedScopes: REQUIRED_SCOPES, connectedBy: actor.userId,
  };
  const id = existing?.id ?? randomUUID();
  if (existing) await db.update(metaConnections).set(values).where(eq(metaConnections.id, id));
  else await db.insert(metaConnections).values({ id, organizationId: actor.organizationId, ...values });
  await upsertAccounts(actor, id, accounts);
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "meta.connect", objectType: "meta_connection", objectId: id, after: { accounts: accounts.length, scopes: REQUIRED_SCOPES }, result: "success", requestId: actor.requestId });
}

async function upsertAccounts(actor: Actor, connectionId: string, remote: Awaited<ReturnType<MetaProvider["listAdAccounts"]>>) {
  for (const a of remote) {
    await db.insert(adAccounts).values({
      id: randomUUID(), organizationId: actor.organizationId, connectionId, externalId: a.externalId, name: a.name,
      currency: a.currency, timezone: a.timezone, remoteStatus: a.status,
    }).onDuplicateKeyUpdate({ set: { connectionId, name: a.name, currency: a.currency, timezone: a.timezone, remoteStatus: a.status } });
  }
}

export async function discoverAccounts(actor: Actor, provider?: MetaProvider) {
  assertCan(actor, "meta.connect");
  const conn = await getConnection(actor);
  if (!conn) throw new AppError("not_found", "Nenhuma conexão com a Meta.");
  const p = provider ?? providerFor(conn);
  try {
    await upsertAccounts(actor, conn.id, await p.listAdAccounts());
  } catch (e) {
    if (e instanceof MetaApiError) {
      await markConnectionError(conn.id, e);
      throw new AppError("conflict", e.message);
    }
    throw e;
  }
}

export async function markConnectionError(connectionId: string, e: MetaApiError) {
  if (e.kind === "token_expired") await db.update(metaConnections).set({ status: "needs_reconnect", lastError: e.message.slice(0, 300) }).where(eq(metaConnections.id, connectionId));
  else await db.update(metaConnections).set({ lastError: e.message.slice(0, 300) }).where(eq(metaConnections.id, connectionId));
}

export async function disconnect(actor: Actor) {
  assertCan(actor, "meta.connect");
  const conn = await getConnection(actor);
  if (!conn) throw new AppError("not_found", "Nenhuma conexão com a Meta.");
  if (conn.mode === "demo") {
    await db.delete(metaConnections).where(eq(metaConnections.id, conn.id)); // cascata remove dados simulados
  } else {
    // Dados históricos reais são mantidos; o token é apagado.
    await db.update(metaConnections).set({ status: "revoked", tokenEnc: null }).where(eq(metaConnections.id, conn.id));
  }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "meta.disconnect", objectType: "meta_connection", objectId: conn.id, before: { mode: conn.mode }, result: "success", requestId: actor.requestId });
}

export async function listAccounts(actor: Actor) {
  assertCan(actor, "insights.read");
  return db.select().from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id))).orderBy(adAccounts.name);
}

export async function configureAccount(actor: Actor, accountId: string, input: { selected: boolean; clientId: string | null }) {
  assertCan(actor, "meta.connect");
  const [acct] = await db.select().from(adAccounts).where(and(eq(adAccounts.id, accountId), eq(adAccounts.organizationId, actor.organizationId))).limit(1);
  if (!acct) throw new AppError("not_found", "Conta não encontrada.");
  if (input.clientId) {
    // o cliente precisa ser da MESMA organização
    const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, actor.organizationId))).limit(1);
    if (!c) throw new AppError("not_found", "Cliente não encontrado.");
  }
  await db.update(adAccounts).set({ isSelected: input.selected, clientId: input.clientId }).where(and(eq(adAccounts.id, accountId), eq(adAccounts.organizationId, actor.organizationId)));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: input.clientId, action: "meta.account_configure", objectType: "ad_account", objectId: accountId, before: { selected: acct.isSelected, clientId: acct.clientId }, after: input, result: "success", requestId: actor.requestId });
}
