import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLog, clients } from "@/db/schema";
import { getActor } from "@/server/context";
import { createClient, deleteClient, getClient, listClients, updateClient } from "@/server/services/clients";
import { addMemberByEmail, changeMemberRole, listActivity, listMembers, removeMember, renameOrganization } from "@/server/services/organizations";
import { addUserWithRole, newOrg } from "./helpers";

describe("isolamento entre organizações", () => {
  it("usuário não vira ator em organização da qual não é membro", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    await expect(getActor(a.userId, b.organizationId)).rejects.toMatchObject({ code: "not_found" });
    await expect(getActor(a.userId, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "not_found" });
  });

  it("cliente de outra organização: leitura, edição e exclusão são bloqueadas", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    const idB = await createClient(b.admin, { name: "Cliente secreto B" });
    await expect(getClient(a.admin, idB)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateClient(a.admin, idB, { name: "Hackeado" })).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteClient(a.admin, idB)).rejects.toMatchObject({ code: "not_found" });
    expect((await listClients(a.admin)).map((c) => c.id)).not.toContain(idB);
    const [still] = await db.select().from(clients).where(eq(clients.id, idB));
    expect(still.name).toBe("Cliente secreto B");
  });

  it("membros, atividades e configurações não vazam nem são alteráveis entre organizações", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    expect((await listMembers(a.admin)).map((m) => m.userId)).not.toContain(b.userId);
    await changeMemberRole(a.admin, b.userId, "analyst").then(
      () => expect.unreachable(),
      (e) => expect(e.code).toBe("not_found"),
    );
    await removeMember(a.admin, b.userId).then(
      () => expect.unreachable(),
      (e) => expect(e.code).toBe("not_found"),
    );
    await renameOrganization(a.admin, "Nome A novo");
    expect((await listActivity(b.admin)).every((x) => x.action !== "org.rename")).toBe(true);
    const bRows = await db.select().from(auditLog).where(eq(auditLog.organizationId, b.organizationId));
    expect(bRows.every((r) => r.userId === b.userId)).toBe(true);
  });

  it("mesmo nome de cliente pode existir em organizações diferentes, mas não duplicado na mesma", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    await createClient(a.admin, { name: "Loja X" });
    await createClient(b.admin, { name: "Loja X" });
    await expect(createClient(a.admin, { name: "Loja X" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("usuário membro de duas organizações só enxerga os clientes da organização ativa", async () => {
    const a = await newOrg("A");
    const b = await newOrg("B");
    await addMemberByEmail(b.admin, a.email, "analyst");
    const idA = await createClient(a.admin, { name: "Só da A" });
    const asB = await getActor(a.userId, b.organizationId);
    expect(asB.role).toBe("analyst");
    await expect(getClient(asB, idA)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("permissões por perfil (verificadas no servidor)", () => {
  it("analista lê, mas não escreve nem administra", async () => {
    const org = await newOrg("P");
    const id = await createClient(org.admin, { name: "Cliente P" });
    const an = await addUserWithRole(org, "analyst");
    expect((await listClients(an.actor)).length).toBeGreaterThan(0);
    await expect(createClient(an.actor, { name: "Novo" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateClient(an.actor, id, { name: "Novo" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(deleteClient(an.actor, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(addMemberByEmail(an.actor, "x@y.com", "admin")).rejects.toMatchObject({ code: "forbidden" });
    await expect(listActivity(an.actor)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("gestor gerencia clientes e vê atividades, mas não administra membros nem configurações", async () => {
    const org = await newOrg("G");
    const m = await addUserWithRole(org, "manager");
    const id = await createClient(m.actor, { name: "Cliente G" });
    await updateClient(m.actor, id, { name: "Cliente G2" });
    expect((await listActivity(m.actor)).length).toBeGreaterThan(0);
    await expect(changeMemberRole(m.actor, org.userId, "analyst")).rejects.toMatchObject({ code: "forbidden" });
    await expect(renameOrganization(m.actor, "Novo nome")).rejects.toMatchObject({ code: "forbidden" });
    await deleteClient(m.actor, id);
  });

  it("não permite remover ou rebaixar o último administrador", async () => {
    const org = await newOrg("L");
    await expect(changeMemberRole(org.admin, org.userId, "analyst")).rejects.toMatchObject({ code: "conflict" });
    await expect(removeMember(org.admin, org.userId)).rejects.toMatchObject({ code: "conflict" });
  });

  it("perfil inválido é rejeitado", async () => {
    const org = await newOrg("V");
    await expect(changeMemberRole(org.admin, org.userId, "superuser")).rejects.toMatchObject({ code: "validation" });
  });
});

describe("auditoria", () => {
  it("registra criação/alteração com antes e depois, sem segredos", async () => {
    const org = await newOrg("U");
    const id = await createClient(org.admin, { name: "C1", notes: "n" });
    await updateClient(org.admin, id, { name: "C2", notes: "n" });
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, org.organizationId), eq(auditLog.clientId, id)));
    const upd = rows.find((r) => r.action === "client.update")!;
    expect(upd.before).toMatchObject({ name: "C1" });
    expect(upd.after).toMatchObject({ name: "C2" });
    expect(upd.userId).toBe(org.userId);
    expect(JSON.stringify(rows)).not.toMatch(/senha|password|token/i);
  });
});
