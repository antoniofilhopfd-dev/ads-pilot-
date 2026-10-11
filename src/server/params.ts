import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { listAccounts } from "./meta/connection";
import { listClients } from "./services/clients";
import { resolvePeriod } from "./insights";
import type { Actor } from "./context";

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseFilters(sp: SP) {
  const dias = [7, 30, 90].includes(Number(one(sp.dias))) ? Number(one(sp.dias)) : 30;
  return { ...resolvePeriod(dias), clientId: one(sp.cliente), accountId: one(sp.conta), dias: String(dias) };
}

export async function filterOptions(actor: Actor) {
  const [clients, accounts] = await Promise.all([listClients(actor), listAccounts(actor)]);
  return { clients: clients.map((c) => ({ id: c.id, name: c.name })), accounts: accounts.filter((a) => a.isSelected).map((a) => ({ id: a.id, name: a.name })) };
}

// Opções de alvo (clientes, contas, campanhas) respeitando o acesso do ator.
export async function targetOptions(actor: Actor, withClients = true) {
  const base = await filterOptions(actor);
  const ids = base.accounts.map((a) => a.id);
  const camps = ids.length ? await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(and(eq(campaigns.organizationId, actor.organizationId), inArray(campaigns.adAccountId, ids))).orderBy(campaigns.name) : [];
  return { clients: withClients && actor.allowedAccountIds === null ? base.clients : [], accounts: base.accounts, campaigns: camps };
}
