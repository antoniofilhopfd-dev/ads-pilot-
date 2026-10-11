import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLog, clients, memberships, organizations, users } from "@/db/schema";
import { resetRateLimits } from "@/lib/rate-limit";
import { getSessionUser, login } from "@/server/services/auth";
import { changePassword, deleteAccount, exportUserData } from "@/server/services/account";
import { createClient } from "@/server/services/clients";
import { changeMemberRole } from "@/server/services/organizations";
import { PW, addUserWithRole, newOrg } from "./helpers";

beforeEach(() => resetRateLimits());

describe("conta e LGPD", () => {
  it("troca de senha exige a atual, mantém a sessão atual e derruba as demais", async () => {
    const org = await newOrg("Pw");
    const s1 = (await login(org.email, PW)).token;
    const s2 = (await login(org.email, PW)).token;
    await expect(changePassword(org.userId, "errada12345", "NovaSenha789xx", s1)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(changePassword(org.userId, PW, "fraca", s1)).rejects.toMatchObject({ code: "validation" });
    await changePassword(org.userId, PW, "NovaSenha789xx", s1);
    expect(await getSessionUser(s1)).not.toBeNull();
    expect(await getSessionUser(s2)).toBeNull();
    await expect(login(org.email, PW)).rejects.toThrow();
    expect((await login(org.email, "NovaSenha789xx")).token).toBeTruthy();
  });

  it("exportação traz dados pessoais e nunca hash de senha ou tokens", async () => {
    const org = await newOrg("Ex");
    await createClient(org.admin, { name: "Cliente X" });
    const data = await exportUserData(org.userId);
    expect(data.user.email).toBe(org.email);
    expect(data.organizations).toHaveLength(1);
    expect(data.activity.length).toBeGreaterThan(0);
    const txt = JSON.stringify(data);
    expect(txt).not.toMatch(/scrypt|passwordHash|token/i);
  });

  it("exclusão exige senha, apaga organização só dele e anonimiza a auditoria", async () => {
    const org = await newOrg("Del");
    await createClient(org.admin, { name: "Será apagado" });
    await expect(deleteAccount(org.userId, "errada12345")).rejects.toMatchObject({ code: "unauthenticated" });
    expect((await deleteAccount(org.userId, PW)).organizationsDeleted).toBe(1);
    expect(await db.select().from(users).where(eq(users.id, org.userId))).toHaveLength(0);
    expect(await db.select().from(organizations).where(eq(organizations.id, org.organizationId))).toHaveLength(0);
    expect(await db.select().from(clients).where(eq(clients.organizationId, org.organizationId))).toHaveLength(0);
    const rows = await db.select().from(auditLog).where(eq(auditLog.organizationId, org.organizationId));
    expect(rows.every((r) => r.userId === null)).toBe(true); // auditoria mantida, anonimizada
  });

  it("não deixa excluir o único administrador de uma organização com outros membros", async () => {
    const org = await newOrg("Adm");
    const m = await addUserWithRole(org, "manager");
    await expect(deleteAccount(org.userId, PW)).rejects.toMatchObject({ code: "conflict" });
    await changeMemberRole(org.admin, m.userId, "admin"); // promove outro administrador
    await deleteAccount(org.userId, PW);
    expect(await db.select().from(memberships).where(eq(memberships.organizationId, org.organizationId))).toHaveLength(1);
    expect(await db.select().from(organizations).where(eq(organizations.id, org.organizationId))).toHaveLength(1); // org sobrevive
  });
});
