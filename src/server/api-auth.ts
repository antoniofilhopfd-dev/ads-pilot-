import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { getActor, listUserOrganizations, type Actor } from "./context";
import { currentUser, ORG_COOKIE } from "./session";

// Ator autenticado para rotas de API (sessão por cookie + organização ativa revalidada no banco). null = sem sessão/organização.
export async function actorFromRequest(req: NextRequest): Promise<Actor | null> {
  const user = await currentUser();
  if (!user) return null;
  const orgs = await listUserOrganizations(user.id);
  const wanted = req.cookies.get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0];
  return org ? getActor(user.id, org.id, randomUUID()) : null;
}
