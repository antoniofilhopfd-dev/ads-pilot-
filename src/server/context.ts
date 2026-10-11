import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import { db } from "@/db";
import { memberAccountAccess, memberships, organizations, type Role } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { can, type Permission } from "./permissions";

// Contexto autenticado de uma operação: usuário + organização + papel,
// sempre derivado do banco (nunca de dados enviados pelo cliente).
// allowedAccountIds: null = todas as contas da organização; lista = acesso RESTRITO a estas contas (pode ser vazia).
export type Actor = { userId: string; organizationId: string; role: Role; requestId?: string; allowedAccountIds: string[] | null };

export async function getActor(userId: string, organizationId: string, requestId?: string): Promise<Actor> {
  const [m] = await db
    .select({ role: memberships.role, accessScope: memberships.accessScope })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  // Mesma resposta para "org inexistente" e "não sou membro": não revela existência.
  if (!m) throw new AppError("not_found", "Organização não encontrada.");
  let allowedAccountIds: string[] | null = null;
  if (m.accessScope === "restricted" && m.role !== "admin") {
    const rows = await db.select({ id: memberAccountAccess.adAccountId }).from(memberAccountAccess).where(and(eq(memberAccountAccess.organizationId, organizationId), eq(memberAccountAccess.userId, userId)));
    allowedAccountIds = rows.map((r) => r.id);
  }
  return { userId, organizationId, role: m.role, requestId, allowedAccountIds };
}

export const isRestricted = (a: Actor) => a.allowedAccountIds !== null;

// Condição SQL para limitar uma coluna de conta de anúncios ao que o ator pode ver (undefined = sem restrição).
// Lista vazia = nada visível (nunca "tudo").
export function accountCond(a: Actor, col: MySqlColumn): SQL | undefined {
  return a.allowedAccountIds === null ? undefined : a.allowedAccountIds.length ? inArray(col, a.allowedAccountIds) : inArray(col, ["00000000-0000-0000-0000-000000000000"]);
}

// Id de conta fora do acesso do ator se comporta como inexistente (não revela que existe).
export function assertAccountAccess(a: Actor, accountId: string) {
  if (a.allowedAccountIds !== null && !a.allowedAccountIds.includes(accountId)) throw new AppError("not_found", "Recurso não encontrado.");
}

// Permissões de alcance da ORGANIZAÇÃO inteira: um membro com acesso restrito não as exerce.
const ORG_WIDE = new Set<Permission>(["clients.write", "audit.read", "members.manage", "org.settings", "meta.connect", "reports.manage", "library.write", "budgets.manage"]);

// Permissão efetiva do ator (papel + restrição de acesso). Usar em telas e checagens; assertCan lança erro.
export const canActor = (actor: Actor, permission: Permission) => !(isRestricted(actor) && ORG_WIDE.has(permission)) && can(actor.role, permission);

export function assertCan(actor: Actor, permission: Permission) {
  if (isRestricted(actor) && ORG_WIDE.has(permission)) throw new AppError("forbidden", "Seu acesso é restrito a contas específicas e não inclui esta ação.");
  if (!can(actor.role, permission)) throw new AppError("forbidden", "Você não tem permissão para esta ação.");
}

export async function listUserOrganizations(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
}
