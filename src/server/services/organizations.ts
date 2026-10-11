import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, memberships, organizations, ROLES, users } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";

export async function listMembers(actor: Actor) {
  assertCan(actor, "org.read");
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, actor.organizationId));
}

// Convites por e-mail ficam para depois (dependem de SMTP). Por ora o administrador
// adiciona um usuário que JÁ possui conta.
export async function addMemberByEmail(actor: Actor, emailRaw: string, role: unknown) {
  assertCan(actor, "members.manage");
  const r = z.enum(ROLES).safeParse(role);
  if (!r.success) throw new AppError("validation", "Perfil inválido.");
  const email = String(emailRaw).trim().toLowerCase();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new AppError("not_found", "Nenhuma conta encontrada com este e-mail. A pessoa precisa se cadastrar primeiro.");
  try {
    await db.insert(memberships).values({ id: randomUUID(), organizationId: actor.organizationId, userId: u.id, role: r.data });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Este usuário já pertence à organização.");
    throw e;
  }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.add", objectType: "membership", objectId: u.id, after: { role: r.data }, result: "success", requestId: actor.requestId });
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
  await db
    .update(memberships)
    .set({ role: r.data })
    .where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "member.role_change", objectType: "membership", objectId: targetUserId, before: { role: current }, after: { role: r.data }, result: "success", requestId: actor.requestId });
}

export async function removeMember(actor: Actor, targetUserId: string) {
  assertCan(actor, "members.manage");
  const current = await getMemberRole(actor, targetUserId);
  if (current === "admin") await assertNotLastAdmin(actor.organizationId);
  await db.delete(memberships).where(and(eq(memberships.userId, targetUserId), eq(memberships.organizationId, actor.organizationId)));
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
