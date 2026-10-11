import { randomUUID } from "node:crypto";
import { register } from "@/server/services/auth";
import { addMemberByEmail } from "@/server/services/organizations";
import { getActor } from "@/server/context";
import type { Role } from "@/db/schema";

export const PW = "SenhaForte123";
export const uniq = () => randomUUID().slice(0, 8);

export async function newOrg(label = "Org") {
  const email = `${label}-${uniq()}@teste.com`.toLowerCase();
  const { userId, organizationId } = await register({ name: `Admin ${label}`, email, password: PW, organizationName: `${label} ${uniq()}` });
  const admin = await getActor(userId, organizationId);
  return { admin, email, userId, organizationId };
}

export async function addUserWithRole(org: { admin: Awaited<ReturnType<typeof getActor>>; organizationId: string }, role: Role) {
  const email = `${role}-${uniq()}@teste.com`;
  const { userId } = await register({ name: `U ${role}`, email, password: PW, organizationName: `Pessoal ${uniq()}` });
  await addMemberByEmail(org.admin, email, role);
  return { actor: await getActor(userId, org.organizationId), userId, email };
}
