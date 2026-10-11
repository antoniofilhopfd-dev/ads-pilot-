import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getActor, listUserOrganizations, type Actor } from "./context";
import { getSessionUser } from "./services/auth";

export const SESSION_COOKIE = "ap_session";
export const ORG_COOKIE = "ap_org";

export const cookieOpts = (maxAgeDays: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeDays * 86400,
});

export async function currentUser() {
  return getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

// Organização ativa: o cookie é só uma preferência; a associação é sempre revalidada no banco.
export async function requireActor(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof currentUser>>>; actor: Actor; orgs: Awaited<ReturnType<typeof listUserOrganizations>> }> {
  const user = await requireUser();
  const orgs = await listUserOrganizations(user.id);
  if (orgs.length === 0) redirect("/login");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const org = orgs.find((o) => o.id === wanted) ?? orgs[0];
  const actor = await getActor(user.id, org.id, randomUUID());
  return { user, actor, orgs };
}

export type ActionResult = { error?: string; ok?: string } | undefined;

export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? undefined;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    logger.error("action_failed", { error: e instanceof Error ? e.message : String(e) });
    return { error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}
