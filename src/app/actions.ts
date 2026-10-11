"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { requireActor, run, cookieOpts, ORG_COOKIE, SESSION_COOKIE, type ActionResult } from "@/server/session";
import { createSession, destroySession, login, register, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { createClient, deleteClient, updateClient } from "@/server/services/clients";
import { addMemberByEmail, changeMemberRole, removeMember, renameOrganization, setMemberAccess } from "@/server/services/organizations";
import { listUserOrganizations } from "@/server/context";
import { configureAccount, connectDemo, disconnect, discoverAccounts } from "@/server/meta/connection";
import { syncAccount, syncAllSelected } from "@/server/meta/sync";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function loginAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    const { token } = await login(str(f, "email"), str(f, "password"), randomUUID());
    (await cookies()).set(SESSION_COOKIE, token, cookieOpts(14));
  });
  if (r?.error) return r;
  redirect("/app");
}

export async function registerAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    const { userId, organizationId } = await register(
      { name: str(f, "name"), email: str(f, "email"), password: str(f, "password"), organizationName: str(f, "organizationName") },
      randomUUID(),
    );
    const c = await cookies();
    c.set(SESSION_COOKIE, await createSession(userId), cookieOpts(14));
    c.set(ORG_COOKIE, organizationId, cookieOpts(365));
  });
  if (r?.error) return r;
  redirect("/app");
}

export async function logoutAction() {
  const c = await cookies();
  await destroySession(c.get(SESSION_COOKIE)?.value);
  c.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function forgotAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    await requestPasswordReset(str(f, "email"));
    return { ok: "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha." };
  });
}

export async function resetAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    if (str(f, "password") !== str(f, "confirm")) throw new AppError("validation", "As senhas não conferem.");
    await resetPassword(str(f, "token"), str(f, "password"));
  });
  if (r?.error) return r;
  redirect("/login?redefinida=1");
}

export async function switchOrgAction(f: FormData) {
  const { user } = await requireActor();
  const orgId = str(f, "organizationId");
  const orgs = await listUserOrganizations(user.id);
  if (orgs.some((o) => o.id === orgId)) (await cookies()).set(ORG_COOKIE, orgId, cookieOpts(365));
  redirect("/app");
}

export async function createClientAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await createClient(actor, { name: str(f, "name"), notes: str(f, "notes") || null });
    revalidatePath("/app/clientes");
    return { ok: "Cliente criado." };
  });
}

export async function deleteClientAction(f: FormData) {
  const { actor } = await requireActor();
  await run(async () => deleteClient(actor, str(f, "clientId")));
  revalidatePath("/app/clientes");
}

export async function updateClientAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await updateClient(actor, str(f, "clientId"), { name: str(f, "name"), notes: str(f, "notes") || null });
    revalidatePath("/app/clientes");
    return { ok: "Cliente atualizado." };
  });
}

export async function addMemberAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await addMemberByEmail(actor, str(f, "email"), str(f, "role"), { restricted: f.get("restricted") === "on" });
    revalidatePath("/app/equipe");
    return { ok: "Membro adicionado." };
  });
}

export async function changeRoleAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await changeMemberRole(actor, str(f, "userId"), str(f, "role"));
    revalidatePath("/app/equipe");
    return { ok: "Perfil atualizado." };
  });
}

export async function removeMemberAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await removeMember(actor, str(f, "userId"));
    revalidatePath("/app/equipe");
    return { ok: "Membro removido." };
  });
}

export async function renameOrgAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await renameOrganization(actor, str(f, "name"));
    revalidatePath("/app", "layout");
    return { ok: "Organização atualizada." };
  });
}

// ───────────── Meta / sincronização ─────────────
export async function connectDemoAction(_: ActionResult, __: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await connectDemo(actor);
    revalidatePath("/app", "layout");
    return { ok: "Modo demonstração ativado. Selecione as contas e sincronize." };
  });
}

export async function disconnectAction(_: ActionResult, __: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await disconnect(actor);
    revalidatePath("/app", "layout");
    return { ok: "Conexão removida." };
  });
}

export async function refreshAccountsAction(_: ActionResult, __: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await discoverAccounts(actor);
    revalidatePath("/app/integracoes");
    return { ok: "Lista de contas atualizada." };
  });
}

export async function configureAccountAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await configureAccount(actor, str(f, "accountId"), { selected: f.get("selected") === "on", clientId: str(f, "clientId") || null });
    revalidatePath("/app", "layout");
    return { ok: "Conta atualizada." };
  });
}

export async function syncAccountAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const r = await syncAccount(actor, str(f, "accountId"), { trigger: "manual" });
    revalidatePath("/app", "layout");
    if (r.status === "failed") return { error: `Sincronização falhou: ${r.errorMessage ?? r.errorCode}` };
    return { ok: r.status === "partial" ? `Sincronização parcial: ${r.errorMessage}` : "Sincronização concluída." };
  });
}

export async function syncAllAction(_: ActionResult, __: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const res = await syncAllSelected(actor, { trigger: "manual" });
    revalidatePath("/app", "layout");
    if (res.length === 0) return { error: "Nenhuma conta selecionada para sincronizar." };
    const bad = res.filter((r) => "error" in r || ("status" in r && r.status === "failed")).length;
    return bad ? { error: `${bad} de ${res.length} conta(s) com falha. Veja o histórico.` } : { ok: `${res.length} conta(s) sincronizada(s).` };
  });
}

// ───────────── Conta e LGPD ─────────────
import { changePassword, deleteAccount, updateProfile } from "@/server/services/account";
import { requireUser } from "@/server/session";

export async function updateProfileAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    await updateProfile(user.id, str(f, "name"));
    revalidatePath("/app", "layout");
    return { ok: "Nome atualizado." };
  });
}

export async function changePasswordAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireUser();
    if (str(f, "password") !== str(f, "confirm")) throw new AppError("validation", "As senhas não conferem.");
    await changePassword(user.id, str(f, "current"), str(f, "password"), (await cookies()).get(SESSION_COOKIE)?.value);
    return { ok: "Senha alterada. Os outros dispositivos foram desconectados." };
  });
}

export async function deleteAccountAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await run(async () => {
    const user = await requireUser();
    await deleteAccount(user.id, str(f, "password"));
    (await cookies()).delete(SESSION_COOKIE);
  });
  if (r?.error) return r;
  redirect("/login");
}

// ───────────── Etapa 04: operações de campanha ─────────────
import { cancelOperation, executeOperation, prepareOperation, reconcileOperation } from "@/server/meta/operations";

export async function prepareOperationAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  let opId: string | undefined;
  const r = await run(async () => {
    const { actor } = await requireActor();
    const raw = str(f, "dailyBudget").trim().replace(/\./g, "").replace(",", ".");
    const prep = await prepareOperation(actor, { campaignId: str(f, "campaignId"), type: str(f, "type"), ...(raw ? { dailyBudget: Number(raw) } : {}) });
    opId = prep.operationId;
  });
  if (r?.error) return r;
  redirect(`/app/operacoes/${opId}`);
}

export async function executeOperationAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await executeOperation(actor, str(f, "operationId"), { acknowledgeLargeChange: f.get("ack") === "on" });
    revalidatePath("/app", "layout");
  });
}

export async function reconcileOperationAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await reconcileOperation(actor, str(f, "operationId"));
    revalidatePath("/app", "layout");
  });
}

export async function cancelOperationAction(f: FormData) {
  const { actor } = await requireActor();
  const campaignId = str(f, "campaignId");
  await run(async () => cancelOperation(actor, str(f, "operationId")));
  redirect(`/app/campanhas/${campaignId}`);
}

// ───────────── Etapa 05: modelos de relatório ─────────────
import { deleteTemplate, saveTemplate } from "@/server/reports/service";
import { parseConfig } from "@/server/reports/builder";

export async function saveTemplateAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const raw: Record<string, string[]> = {};
    for (const k of ["tipo", "dias", "cliente", "conta", "secoes"]) raw[k] = f.getAll(k).map(String);
    await saveTemplate(actor, str(f, "name"), parseConfig(raw));
    revalidatePath("/app/relatorios");
    return { ok: "Modelo salvo." };
  });
}

export async function deleteTemplateAction(f: FormData) {
  const { actor } = await requireActor();
  await run(async () => deleteTemplate(actor, str(f, "templateId")));
  revalidatePath("/app/relatorios");
}

// ───────────── Etapa 06: MCP ─────────────
import { createMcpToken, revokeMcpToken } from "@/server/mcp/tokens";
import { issueConfirmationCode } from "@/server/meta/operations";

export async function createMcpTokenAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const { token } = await createMcpToken(actor, { name: str(f, "name"), scopes: f.getAll("scope").map(String), ttlDays: Number(str(f, "ttl")) });
    revalidatePath("/app/mcp");
    return { ok: `Token criado — copie agora, ele não será mostrado de novo: ${token}` };
  });
}

export async function revokeMcpTokenAction(f: FormData) {
  const { actor } = await requireActor();
  await run(async () => revokeMcpToken(actor, str(f, "tokenId")));
  revalidatePath("/app/mcp");
}

export async function issueCodeAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const r = await issueConfirmationCode(actor, str(f, "operationId"));
    return { ok: `Código de confirmação: ${r.code} (válido por 10 min, uso único). Informe-o ao assistente SOMENTE se você revisou a alteração acima.` };
  });
}


export async function setMemberAccessAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await setMemberAccess(actor, str(f, "userId"), { scope: str(f, "scope"), accountIds: f.getAll("accountId").map(String) });
    revalidatePath("/app", "layout");
    return { ok: "Acesso atualizado." };
  });
}

// ───────────── Logo da empresa ─────────────
import { deleteLogo, saveLogo } from "@/server/services/logo";

export async function uploadLogoAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    const file = f.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Escolha um arquivo PNG ou JPEG.");
    if (file.size > 1_000_000) throw new AppError("validation", "Arquivo grande demais (máximo 1 MB).");
    await saveLogo(actor, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/app", "layout");
    return { ok: "Logo atualizada. Ela aparecerá nos próximos relatórios." };
  });
}

export async function deleteLogoAction(_: ActionResult, __: FormData): Promise<ActionResult> {
  return run(async () => {
    const { actor } = await requireActor();
    await deleteLogo(actor);
    revalidatePath("/app", "layout");
    return { ok: "Logo removida." };
  });
}
