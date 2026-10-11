import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, type Role } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { can, type Permission } from "./permissions";

// Contexto autenticado de uma operação: usuário + organização + papel,
// sempre derivado do banco (nunca de dados enviados pelo cliente).
export type Actor = { userId: string; organizationId: string; role: Role; requestId?: string };

export async function getActor(userId: string, organizationId: string, requestId?: string): Promise<Actor> {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  // Mesma resposta para "org inexistente" e "não sou membro": não revela existência.
  if (!m) throw new AppError("not_found", "Organização não encontrada.");
  return { userId, organizationId, role: m.role, requestId };
}

export function assertCan(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new AppError("forbidden", "Você não tem permissão para esta ação.");
}

export async function listUserOrganizations(userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
}
