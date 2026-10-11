import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, emailOutbox, memberships, organizations, sessions, users } from "@/db/schema";
import { hashPassword, hashToken, verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit } from "../audit";
import { passwordSchema } from "./auth";

async function getUserOrThrow(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AppError("not_found", "Usuário não encontrado.");
  return u;
}

async function requirePassword(userId: string, password: string) {
  const u = await getUserOrThrow(userId);
  if (!(await verifyPassword(String(password), u.passwordHash))) throw new AppError("unauthenticated", "Senha atual incorreta.");
  return u;
}

export async function updateProfile(userId: string, name: unknown) {
  const n = String(name ?? "").trim();
  if (n.length < 2 || n.length > 120) throw new AppError("validation", "Informe um nome válido.");
  await db.update(users).set({ name: n }).where(eq(users.id, userId));
  await audit({ userId, action: "user.profile_update", objectType: "user", objectId: userId, after: { name: n }, result: "success" });
}

// Troca a senha e encerra TODAS as outras sessões (a atual é mantida).
export async function changePassword(userId: string, current: string, next: unknown, currentSessionToken?: string) {
  await requirePassword(userId, current);
  const p = passwordSchema.safeParse(next);
  if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const passwordHash = await hashPassword(p.data);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(currentSessionToken ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(currentSessionToken))) : eq(sessions.userId, userId));
  });
  await audit({ userId, action: "user.password_change", objectType: "user", objectId: userId, result: "success" });
}

// Direito de acesso/portabilidade (LGPD): dados pessoais do usuário. Nunca inclui hash de senha nem tokens.
export async function exportUserData(userId: string) {
  const u = await getUserOrThrow(userId);
  const orgs = await db
    .select({ organizationId: organizations.id, organization: organizations.name, role: memberships.role, since: memberships.createdAt })
    .from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(eq(memberships.userId, userId));
  const activity = await db
    .select({ at: auditLog.createdAt, action: auditLog.action, objectType: auditLog.objectType, organizationId: auditLog.organizationId, result: auditLog.result })
    .from(auditLog).where(eq(auditLog.userId, userId)).orderBy(auditLog.createdAt);
  await audit({ userId, action: "user.data_export", objectType: "user", objectId: userId, result: "success" });
  return { generatedAt: new Date().toISOString(), user: { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }, organizations: orgs, activity };
}

// Exclusão de conta. Regras:
//  • exige senha;
//  • se for o ÚLTIMO administrador de uma organização que ainda tem outros membros, bloqueia (transferir antes);
//  • organizações em que é o único membro são excluídas junto (com todos os dados);
//  • o histórico de auditoria é mantido, anonimizado (user_id removido).
export async function deleteAccount(userId: string, password: string) {
  const u = await requirePassword(userId, password);
  const mine = await db.select({ orgId: memberships.organizationId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId));
  const soloOrgs: string[] = [];
  for (const m of mine) {
    const others = await db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, m.orgId), ne(memberships.userId, userId)));
    if (others.length === 0) soloOrgs.push(m.orgId);
    else if (m.role === "admin" && !others.some((o) => o.role === "admin")) {
      const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, m.orgId));
      throw new AppError("conflict", `Você é o único administrador de “${o.name}”, que tem outros membros. Promova outro administrador antes de excluir a conta.`);
    }
  }
  await db.transaction(async (tx) => {
    for (const orgId of soloOrgs) await tx.delete(organizations).where(eq(organizations.id, orgId)); // cascata
    await tx.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));
    await tx.delete(emailOutbox).where(eq(emailOutbox.toEmail, u.email));
    await tx.delete(users).where(eq(users.id, userId)); // cascata: sessões, tokens, vínculos
  });
  await audit({ action: "user.delete", objectType: "user", objectId: randomUUID(), after: { orgsDeleted: soloOrgs.length }, result: "success" });
  return { organizationsDeleted: soloOrgs.length };
}

void sql;
