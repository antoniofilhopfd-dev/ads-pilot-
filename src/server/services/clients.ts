import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, clients } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";

const clientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(120),
  notes: z.string().trim().max(2000).optional().nullable(),
});

// Acesso restrito: só os clientes que possuem ao menos uma conta de anúncios liberada para o ator.
async function visibleClientCond(actor: Actor) {
  if (actor.allowedAccountIds === null) return undefined;
  const rows = actor.allowedAccountIds.length ? await db.selectDistinct({ id: adAccounts.clientId }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), inArray(adAccounts.id, actor.allowedAccountIds))) : [];
  const ids = rows.map((r) => r.id).filter((x): x is string => !!x);
  return inArray(clients.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}

export async function listClients(actor: Actor) {
  assertCan(actor, "clients.read");
  return db.select().from(clients).where(and(eq(clients.organizationId, actor.organizationId), await visibleClientCond(actor))).orderBy(asc(clients.name));
}

// Toda busca por id inclui organization_id: id de outra organização = "não encontrado".
export async function getClient(actor: Actor, clientId: string) {
  assertCan(actor, "clients.read");
  const [c] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId), await visibleClientCond(actor)))
    .limit(1);
  if (!c) throw new AppError("not_found", "Cliente não encontrado.");
  return c;
}

export async function createClient(actor: Actor, input: unknown) {
  assertCan(actor, "clients.write");
  const p = clientSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const id = randomUUID();
  try {
    await db.insert(clients).values({ id, organizationId: actor.organizationId, name: p.data.name, notes: p.data.notes ?? null });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Já existe um cliente com este nome.");
    throw e;
  }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: id, action: "client.create", objectType: "client", objectId: id, after: p.data, result: "success", requestId: actor.requestId });
  return id;
}

export async function updateClient(actor: Actor, clientId: string, input: unknown) {
  assertCan(actor, "clients.write");
  const before = await getClient(actor, clientId);
  const p = clientSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  await db
    .update(clients)
    .set({ name: p.data.name, notes: p.data.notes ?? null })
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId)));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId, action: "client.update", objectType: "client", objectId: clientId, before: { name: before.name, notes: before.notes }, after: p.data, result: "success", requestId: actor.requestId });
}

export async function deleteClient(actor: Actor, clientId: string) {
  assertCan(actor, "clients.write");
  const before = await getClient(actor, clientId);
  await db.delete(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId)));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId, action: "client.delete", objectType: "client", objectId: clientId, before: { name: before.name }, result: "success", requestId: actor.requestId });
}
