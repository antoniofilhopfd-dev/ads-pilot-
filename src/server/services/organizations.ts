import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, auditLog, memberAccountAccess, memberships, organizations, ROLES, users } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";

export async function listMembers(actor: Actor) {
  assertCan(actor, "org.read");
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, accessScope: memberships.accessScope })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, actor.organizationId));
}

// Convites por e-mail ficam para depois (dependem de SMTP). Por ora o administrador
// adiciona um usuário que JÁ possui conta.
export async function addMemberByEmail(actor: Actor, emailRaw: string, role: unknown, opts: { restricted?: boolean } = {}) {
  assertCan(actor, "members.manage");
  const r = z.enum(ROLES).safeParse(role);
  if (!r.success) throw new AppError("validation", "Perfil inválido.");
  const email = String(emailRaw).trim().toLowerCase();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new AppError("not_found", "Nenhuma conta encontrada com este e-mail. A pessoa precisa se cadastrar primeiro.");
  try {
    const restricted = !!opts.restricted && r.data !== "admin"; // restrito = não vê nenhuma conta até o administrador liberar
    await db.insert(memberships).values({ id: randomUUID(), organizationId: actor.organizationId, userId: u.id, role: r.data, accessScope: restricted ? "restricted" : "all" });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Este usuário já pertence à organização.");
    throw e;
  }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.add", objectType: "membership", objectId: u.id, after: { role: r.data, accessScope: opts.restricted && r.data !== "admin" ? "restricted" : "all" }, result: "success", requestId: actor.requestId });
}

async function getMemberRole(actor: Actor, targetUserId: string) {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)))
    .limit(1);
  if (!m) throw new AppError("not_found", "Membro não encontrado.");
  return m.role;
}

async function assertNotLastAdmin(organizationId: string) {
  const admins = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "admin")));
  if (admins.length <= 1) throw new AppError("conflict", "A organização precisa ter ao menos um administrador.");
}

export async function changeMemberRole(actor: Actor, targetUserId: string, role: unknown) {
  assertCan(actor, "members.manage");
  const r = z.enum(ROLES).safeParse(role);
  if (!r.success) throw new AppError("validation", "Perfil inválido.");
  const current = await getMemberRole(actor, targetUserId);
  if (current === "admin" && r.data !== "admin") await assertNotLastAdmin(actor.organizationId);
  await db.transaction(async (tx) => {
    // administradores sempre têm acesso total: ao promover, a restrição é removida
    await tx.update(memberships).set({ role: r.data, ...(r.data === "admin" ? { accessScope: "all" as const } : {}) }).where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)));
    if (r.data === "admin") await tx.delete(memberAccountAccess).where(and(eq(memberAccountAccess.userId, targetUserId), eq(memberAccountAccess.organizationId, actor.organizationId)));
  });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.role_change", objectType: "membership", objectId: targetUserId, before: { role: current }, after: { role: r.data }, result: "success", requestId: actor.requestId });
}

export async function removeMember(actor: Actor, targetUserId: string) {
  assertCan(actor, "members.manage");
  const current = await getMemberRole(actor, targetUserId);
  if (current === "admin") await assertNotLastAdmin(actor.organizationId);
  await db.transaction(async (tx) => {
    await tx.delete(memberAccountAccess).where(and(eq(memberAccountAccess.userId, targetUserId), eq(memberAccountAccess.organizationId, actor.organizationId)));
    await tx.delete(memberships).where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)));
  });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.remove", objectType: "membership", objectId: targetUserId, before: { role: current }, result: "success", requestId: actor.requestId });
}

export async function renameOrganization(actor: Actor, name: unknown) {
  assertCan(actor, "org.settings");
  const p = z.string().trim().min(2).max(120).safeParse(name);
  if (!p.success) throw new AppError("validation", "Nome inválido.");
  const [before] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, actor.organizationId));
  await db.update(organizations).set({ name: p.data }).where(eq(organizations.id, actor.organizationId));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "org.rename", objectType: "organization", objectId: actor.organizationId, before, after: { name: p.data }, result: "success", requestId: actor.requestId });
}

export async function listActivity(actor: Actor, limit = 100) {
  assertCan(actor, "audit.read");
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      objectType: auditLog.objectType,
      result: auditLog.result,
      createdAt: auditLog.createdAt,
      userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.organizationId, actor.organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}


// ───────────── Acesso por conta de anúncios ─────────────
// Mapa usuário → contas liberadas (somente para quem gerencia a equipe).
export async function listMemberAccess(actor: Actor) {
  assertCan(actor, "members.manage");
  const rows = await db.select({ userId: memberAccountAccess.userId, accountId: memberAccountAccess.adAccountId }).from(memberAccountAccess).where(eq(memberAccountAccess.organizationId, actor.organizationId));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.accountId]);
  return map;
}

// scope "all": acesso a todas as contas. scope "restricted": somente às contas indicadas (lista vazia = nenhuma).
// Administradores não podem ser restringidos. Contas novas NÃO são liberadas automaticamente a membros restritos.
export async function setMemberAccess(actor: Actor, targetUserId: string, input: { scope: unknown; accountIds: unknown }) {
  assertCan(actor, "members.manage");
  const scope = z.enum(["all", "restricted"]).safeParse(input.scope);
  const ids = z.array(z.string().uuid()).max(500).safeParse(input.accountIds ?? []);
  if (!scope.success || !ids.success) throw new AppError("validation", "Dados de acesso inválidos.");
  const role = await getMemberRole(actor, targetUserId);
  if (role === "admin" && scope.data === "restricted") throw new AppError("conflict", "Administradores sempre têm acesso a todas as contas. Altere o perfil antes de restringir.");
  const accountIds = [...new Set(ids.data)];
  if (scope.data === "restricted" && accountIds.length) {
    const found = await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), inArray(adAccounts.id, accountIds)));
    if (found.length !== accountIds.length) throw new AppError("not_found", "Conta não encontrada."); // conta de outra organização = inexistente
  }
  const before = await db.select({ accountId: memberAccountAccess.adAccountId }).from(memberAccountAccess).where(and(eq(memberAccountAccess.userId, targetUserId), eq(memberAccountAccess.organizationId, actor.organizationId)));
  await db.transaction(async (tx) => {
    await tx.update(memberships).set({ accessScope: scope.data }).where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)));
    await tx.delete(memberAccountAccess).where(and(eq(memberAccountAccess.userId, targetUserId), eq(memberAccountAccess.organizationId, actor.organizationId)));
    if (scope.data === "restricted" && accountIds.length) await tx.insert(memberAccountAccess).values(accountIds.map((adAccountId) => ({ organizationId: actor.organizationId, userId: targetUserId, adAccountId })));
  });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.access_change", objectType: "membership", objectId: targetUserId, before: { accounts: before.length }, after: { scope: scope.data, accounts: scope.data === "restricted" ? accountIds.length : "todas" }, result: "success", requestId: actor.requestId });
}
