import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, campaigns, metaConnections, operations, OP_TYPES } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { audit } from "../audit";
import { accountCond, assertAccountAccess, assertCan, type Actor } from "../context";
import { providerFor } from "./connection";
import { isWriter, MetaApiError, type CampaignPatch, type CampaignRemoteState, type MetaProvider, type MetaWriter } from "./types";

// Fluxo obrigatório: consultar estado atual → preparar (mostra atual × novo) → validar → confirmar explicitamente →
// executar UMA vez → verificar no remoto → auditar → informar o resultado real.
// Uma recomendação de IA ou um clique em "preparar" NÃO autoriza nada: só a confirmação do usuário autenticado,
// com permissão `campaigns.write`, na mesma organização e sobre o mesmo recurso/operação.
const PREPARED_TTL_MS = 15 * 60_000;
const EXECUTING_STALE_MS = 5 * 60_000;
const LARGE_CHANGE_PCT = 50;
const MAX_DAILY_BUDGET = 1_000_000;

type Op = typeof operations.$inferSelect;
type Opts = { provider?: MetaProvider; now?: Date };
type PrepOpts = Opts & { origin?: "web" | "mcp"; mcpTokenId?: string; clientRequestId?: string };

const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);
const snap = (s: CampaignRemoteState) => ({ status: s.status, effectiveStatus: s.effectiveStatus, dailyBudget: s.dailyBudget });

function targetPatch(op: Pick<Op, "type" | "params">): CampaignPatch {
  if (op.type === "pause") return { status: "PAUSED" };
  if (op.type === "activate") return { status: "ACTIVE" };
  return { dailyBudget: op.params.dailyBudget };
}

function matchesTarget(op: Pick<Op, "type" | "params">, s: CampaignRemoteState) {
  const t = targetPatch(op);
  return (t.status === undefined || s.status === t.status) && (t.dailyBudget === undefined || same(s.dailyBudget, t.dailyBudget));
}

async function load(actor: Actor, campaignId: string) {
  const [row] = await db
    .select({ c: campaigns, a: adAccounts, conn: metaConnections })
    .from(campaigns).innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId)).innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, actor.organizationId), eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id)))
    .limit(1);
  if (!row) throw new AppError("not_found", "Campanha não encontrada.");
  return row;
}

function writerFor(conn: typeof metaConnections.$inferSelect, provider?: MetaProvider): MetaProvider & MetaWriter {
  if (conn.status !== "active") throw new AppError("conflict", "A conexão com a Meta precisa ser refeita antes de operar campanhas.");
  const p = provider ?? providerFor(conn);
  if (!isWriter(p)) throw new AppError("conflict", "Alterar campanhas na Meta real ainda não está habilitado: exige a permissão ads_management e validação com conta de teste. Hoje só o modo demonstração aceita operações.");
  return p;
}

const prepareSchema = z.object({
  campaignId: z.string().uuid(),
  type: z.enum(OP_TYPES),
  dailyBudget: z.number().finite().optional(),
});

export async function prepareOperation(actor: Actor, input: unknown, opts: PrepOpts = {}) {
  assertCan(actor, "campaigns.write");
  const p = prepareSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", "Parâmetros inválidos.");
  const { campaignId, type, dailyBudget } = p.data;
  // Deduplicação: o mesmo clientRequestId devolve a operação já preparada (sem criar outra).
  if (opts.clientRequestId) {
    const [dup] = await db.select().from(operations).where(and(eq(operations.organizationId, actor.organizationId), eq(operations.clientRequestId, opts.clientRequestId))).limit(1);
    if (dup) {
      assertAccountAccess(actor, dup.adAccountId);
      if (dup.campaignId !== campaignId || dup.type !== type || dup.params.dailyBudget !== dailyBudget) throw new AppError("conflict", "Este clientRequestId já foi usado para outra operação.");
      return { operationId: dup.id, campaign: "", type, before: dup.before, warnings: dup.warnings, requiresAcknowledgement: dup.warnings.some((w) => w.startsWith("Aumento")), expiresAt: dup.expiresAt, duplicate: true };
    }
  }
  const { c, a, conn } = await load(actor, campaignId);
  const writer = writerFor(conn, opts.provider);

  // 1) estado atual REAL (remoto), não o cache local
  const current = await readRemote(writer, a.externalId, c.externalId);
  const warnings: string[] = [];

  // 2) validações
  if (type === "pause" && current.status !== "ACTIVE") throw new AppError("validation", "Só é possível pausar uma campanha que está ativa.");
  if (type === "activate" && current.status !== "PAUSED") throw new AppError("validation", "Só é possível reativar uma campanha que está pausada.");
  if (type === "set_daily_budget") {
    if (dailyBudget === undefined) throw new AppError("validation", "Informe o novo orçamento diário.");
    if (dailyBudget < 1 || dailyBudget > MAX_DAILY_BUDGET) throw new AppError("validation", `O orçamento diário deve estar entre 1 e ${MAX_DAILY_BUDGET.toLocaleString("pt-BR")}.`);
    if (Math.round(dailyBudget * 100) !== dailyBudget * 100 && Math.abs(dailyBudget * 100 - Math.round(dailyBudget * 100)) > 1e-6) throw new AppError("validation", "Use no máximo 2 casas decimais.");
    if (current.dailyBudget === null) throw new AppError("validation", "Esta campanha não tem orçamento diário (usa orçamento total ou o orçamento fica nos conjuntos); não é possível alterá-lo aqui.");
    if (same(current.dailyBudget, dailyBudget)) throw new AppError("validation", "O novo orçamento é igual ao atual.");
    const pct = ((dailyBudget - current.dailyBudget) / current.dailyBudget) * 100;
    if (pct > LARGE_CHANGE_PCT) warnings.push(`Aumento de ${pct.toFixed(0)}% no orçamento diário (acima de ${LARGE_CHANGE_PCT}%). Isso aumenta o gasto potencial e pode reiniciar a fase de aprendizado. Exige confirmação reforçada.`);
    if (pct < -LARGE_CHANGE_PCT) warnings.push(`Redução de ${Math.abs(pct).toFixed(0)}% no orçamento diário.`);
  }
  if (conn.mode === "demo") warnings.push("SIMULAÇÃO: esta operação acontece no ambiente de demonstração e não altera nada na Meta.");

  const id = randomUUID();
  const now = opts.now ?? new Date();
  await db.insert(operations).values({
    id, organizationId: actor.organizationId, adAccountId: a.id, campaignId, clientId: a.clientId, type, mode: conn.mode,
    params: type === "set_daily_budget" ? { dailyBudget } : {}, before: snap(current), warnings, status: "prepared",
    createdBy: actor.userId, createdAt: now, expiresAt: new Date(now.getTime() + PREPARED_TTL_MS),
    origin: opts.origin ?? "web", mcpTokenId: opts.mcpTokenId ?? null, clientRequestId: opts.clientRequestId ?? null,
  });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: a.clientId, action: "operation.prepare", objectType: "campaign", objectId: campaignId, before: snap(current), after: { type, dailyBudget, origin: opts.origin ?? "web" }, result: "success", requestId: actor.requestId });
  return { operationId: id, campaign: c.name, type, before: snap(current), warnings, requiresAcknowledgement: warnings.some((w) => w.startsWith("Aumento")), expiresAt: new Date(now.getTime() + PREPARED_TTL_MS), duplicate: false };
}

async function readRemote(w: MetaWriter, acct: string, camp: string) {
  try {
    return await w.getCampaignState(acct, camp);
  } catch (e) {
    if (e instanceof MetaApiError) throw new AppError("conflict", `Não foi possível ler o estado atual na Meta: ${e.message}`);
    throw e;
  }
}

async function getOp(actor: Actor, operationId: string): Promise<Op> {
  const [op] = await db.select().from(operations).where(and(eq(operations.id, operationId), eq(operations.organizationId, actor.organizationId))).limit(1);
  if (!op) throw new AppError("not_found", "Operação não encontrada.");
  assertAccountAccess(actor, op.adAccountId); // operação de conta fora do acesso do ator = inexistente
  return op;
}

export async function getOperation(actor: Actor, operationId: string) {
  assertCan(actor, "insights.read");
  const op = await getOp(actor, operationId);
  const [c] = await db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, op.campaignId));
  return { ...op, campaignName: c?.name ?? "—" };
}

export async function cancelOperation(actor: Actor, operationId: string) {
  assertCan(actor, "campaigns.write");
  const op = await getOp(actor, operationId);
  const [r] = await db.update(operations).set({ status: "cancelled", resultMessage: "Cancelada pelo usuário." }).where(and(eq(operations.id, op.id), eq(operations.status, "prepared")));
  if (r.affectedRows !== 1) throw new AppError("conflict", "Só operações preparadas podem ser canceladas.");
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: op.clientId, action: "operation.cancel", objectType: "campaign", objectId: op.campaignId, result: "success", requestId: actor.requestId });
}

// Executa UMA vez. Chamar de novo sobre operação já concluída devolve o resultado guardado (idempotente).
export async function executeOperation(actor: Actor, operationId: string, input: { acknowledgeLargeChange?: boolean } = {}, opts: Opts = {}) {
  assertCan(actor, "campaigns.write");
  const now = opts.now ?? new Date();
  let op = await getOp(actor, operationId);

  if (op.status === "succeeded" || op.status === "failed" || op.status === "ambiguous" || op.status === "cancelled" || op.status === "expired") return present(op);
  if (op.status === "executing") throw new AppError("conflict", "Esta operação já está em execução.");
  // vinculada ao autor: só o criador ou um administrador confirma
  if (op.createdBy !== actor.userId && actor.role !== "admin") throw new AppError("forbidden", "Apenas quem preparou a operação (ou um administrador) pode confirmá-la.");
  if (op.expiresAt.getTime() < now.getTime()) {
    await db.update(operations).set({ status: "expired", resultMessage: "Confirmação expirada. Prepare novamente." }).where(and(eq(operations.id, op.id), eq(operations.status, "prepared")));
    throw new AppError("conflict", "A confirmação expirou. Prepare a operação novamente.");
  }
  if (op.warnings.some((w) => w.startsWith("Aumento")) && !input.acknowledgeLargeChange) throw new AppError("validation", "Confirme explicitamente que está ciente do aumento grande de orçamento.");

  // Transição atômica prepared → executing: impede execução dupla (duplo clique, requisições paralelas).
  const [claim] = await db.update(operations).set({ status: "executing", confirmedBy: actor.userId, executedAt: now, params: { ...op.params, acknowledgedLargeChange: !!input.acknowledgeLargeChange } })
    .where(and(eq(operations.id, op.id), eq(operations.status, "prepared"), gt(operations.expiresAt, now)));
  if (claim.affectedRows !== 1) throw new AppError("conflict", "Esta operação já foi confirmada ou não está mais disponível.");

  const { c, a, conn } = await load(actor, op.campaignId);
  let writer: MetaProvider & MetaWriter;
  try {
    writer = writerFor(conn, opts.provider);
  } catch (e) {
    return finish(actor, op, "failed", null, (e as AppError).message);
  }

  // Revalida: se o estado remoto mudou desde o "preparar", a prévia mostrada ao usuário ficou falsa → aborta.
  let current: CampaignRemoteState;
  try { current = await writer.getCampaignState(a.externalId, c.externalId); }
  catch (e) { return finish(actor, op, "failed", null, `Não foi possível ler o estado na Meta antes de executar: ${(e as Error).message}`); }
  if (!(current.status === op.before.status && same(current.dailyBudget, op.before.dailyBudget))) {
    return finish(actor, op, "failed", snap(current), "O estado da campanha mudou desde o preparo. Nada foi alterado; prepare novamente.");
  }

  // Escrita. Em erro/resultado desconhecido NÃO repetimos: lemos o remoto para saber o que aconteceu.
  let writeError: MetaApiError | Error | null = null;
  try { await writer.updateCampaign(a.externalId, c.externalId, targetPatch(op)); }
  catch (e) { writeError = e as Error; }

  let after: CampaignRemoteState | null = null;
  try { after = await writer.getCampaignState(a.externalId, c.externalId); } catch { /* verificação indisponível */ }

  if (after && matchesTarget(op, after)) {
    await db.update(campaigns).set({ status: after.status, effectiveStatus: after.effectiveStatus, dailyBudget: after.dailyBudget === null ? null : after.dailyBudget.toFixed(2) }).where(eq(campaigns.id, op.campaignId));
    const note = writeError ? "Concluída e verificada: a Meta devolveu erro na chamada, mas o estado confirmado já reflete a alteração." : "Concluída e verificada no estado remoto.";
    return finish(actor, op, "succeeded", snap(after), note);
  }
  if (after && !writeError) return finish(actor, op, "ambiguous", snap(after), "A Meta aceitou a chamada, mas o estado lido depois NÃO reflete a alteração. Verifique antes de repetir.");
  if (after && writeError) return finish(actor, op, "failed", snap(after), `Falha ao alterar: ${writeError.message}. O estado remoto confirma que nada mudou; é seguro preparar novamente.`);
  return finish(actor, op, "ambiguous", null, `Resultado desconhecido: ${writeError ? writeError.message : "chamada enviada"} e não foi possível verificar o estado. Use “Verificar estado” antes de repetir.`);
}

// Resolve operações "ambiguous"/"executing" travadas lendo o estado remoto — nunca reexecuta a escrita.
export async function reconcileOperation(actor: Actor, operationId: string, opts: Opts = {}) {
  assertCan(actor, "campaigns.write");
  const now = opts.now ?? new Date();
  const op = await getOp(actor, operationId);
  const stuck = op.status === "ambiguous" || (op.status === "executing" && op.executedAt && now.getTime() - op.executedAt.getTime() > EXECUTING_STALE_MS);
  if (!stuck) throw new AppError("conflict", "Esta operação não precisa de verificação.");
  const { c, a, conn } = await load(actor, op.campaignId);
  const writer = writerFor(conn, opts.provider);
  let state: CampaignRemoteState;
  try { state = await writer.getCampaignState(a.externalId, c.externalId); }
  catch (e) { throw new AppError("conflict", `Ainda não foi possível ler o estado na Meta: ${(e as Error).message}`); }
  await db.update(operations).set({ status: "executing" }).where(eq(operations.id, op.id)); // reabre para finalizar
  if (matchesTarget(op, state)) {
    await db.update(campaigns).set({ status: state.status, effectiveStatus: state.effectiveStatus, dailyBudget: state.dailyBudget === null ? null : state.dailyBudget.toFixed(2) }).where(eq(campaigns.id, op.campaignId));
    return finish(actor, op, "succeeded", snap(state), "Verificada depois: o estado remoto reflete a alteração.");
  }
  return finish(actor, op, "failed", snap(state), "Verificada depois: o estado remoto NÃO reflete a alteração; nada foi aplicado.");
}

async function finish(actor: Actor, op: Op, status: "succeeded" | "failed" | "ambiguous", after: CampaignRemoteState | null, message: string) {
  const verified = status === "succeeded";
  await db.update(operations).set({ status, after: after ? snap(after) : null, resultMessage: message.slice(0, 400), verifiedAt: verified ? new Date() : null }).where(eq(operations.id, op.id));
  await audit({
    organizationId: actor.organizationId, userId: actor.userId, clientId: op.clientId, action: `operation.${op.type}`, objectType: "campaign", objectId: op.campaignId,
    before: op.before, after: after ? snap(after) : null, result: status === "succeeded" ? "success" : "failure", error: status === "succeeded" ? null : message, requestId: actor.requestId,
  });
  if (status !== "succeeded") logger.warn("operation_not_confirmed", { operationId: op.id, status });
  return present({ ...op, status, after: after ? snap(after) : null, resultMessage: message, verifiedAt: verified ? new Date() : null });
}

function present(op: Op) {
  return { operationId: op.id, status: op.status, type: op.type, before: op.before, after: op.after, message: op.resultMessage, verified: op.status === "succeeded", mode: op.mode };
}

export async function listOperations(actor: Actor, limit = 50) {
  assertCan(actor, "insights.read");
  // preparadas vencidas viram "expiradas" ao listar
  await db.update(operations).set({ status: "expired", resultMessage: "Confirmação expirada." }).where(and(eq(operations.organizationId, actor.organizationId), eq(operations.status, "prepared"), lt(operations.expiresAt, new Date())));
  return db.select({ op: operations, campaignName: campaigns.name }).from(operations).innerJoin(campaigns, eq(campaigns.id, operations.campaignId))
    .where(and(eq(operations.organizationId, actor.organizationId), accountCond(actor, operations.adAccountId))).orderBy(desc(operations.createdAt)).limit(limit);
}


// ── Confirmação humana para operações preparadas por assistente (MCP) ──
// O assistente NÃO pode se autoconfirmar: o código só é gerado na interface web, por uma pessoa autenticada
// (autor ou administrador), é mostrado uma vez, vale 10 min, tem 5 tentativas e é de uso único.
const CODE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const codeHash = (opId: string, code: string) => createHash("sha256").update(`${opId}:${code.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`).digest("hex");

export async function issueConfirmationCode(actor: Actor, operationId: string, now = new Date()) {
  assertCan(actor, "campaigns.write");
  const op = await getOp(actor, operationId);
  if (op.origin !== "mcp") throw new AppError("conflict", "Só operações preparadas por assistente usam código de confirmação.");
  if (op.status !== "prepared") throw new AppError("conflict", "A operação não está mais aguardando confirmação.");
  if (op.expiresAt.getTime() < now.getTime()) throw new AppError("conflict", "A operação expirou. Peça ao assistente para preparar novamente.");
  if (op.createdBy !== actor.userId && actor.role !== "admin") throw new AppError("forbidden", "Apenas quem autorizou o assistente (ou um administrador) pode gerar o código.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem caracteres ambíguos
  const raw = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
  await db.update(operations).set({ confirmationCodeHash: codeHash(op.id, raw), confirmationExpiresAt: new Date(now.getTime() + CODE_TTL_MS), confirmationAttempts: 0 }).where(eq(operations.id, op.id));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: op.clientId, action: "operation.confirmation_code_issued", objectType: "campaign", objectId: op.campaignId, result: "success", requestId: actor.requestId });
  return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: new Date(now.getTime() + CODE_TTL_MS) };
}

export async function executeWithConfirmationCode(actor: Actor, operationId: string, code: string, input: { acknowledgeLargeChange?: boolean } = {}, opts: Opts = {}) {
  assertCan(actor, "campaigns.write");
  const now = opts.now ?? new Date();
  const op = await getOp(actor, operationId);
  if (op.status !== "prepared") return executeOperation(actor, operationId, input, opts); // devolve o resultado já guardado (idempotente)
  if (!op.confirmationCodeHash || !op.confirmationExpiresAt || op.confirmationExpiresAt.getTime() < now.getTime())
    throw new AppError("forbidden", "Sem confirmação humana válida. Peça ao usuário para gerar um código de confirmação no AdsPilot (Operações) e informá-lo.");
  // conta a tentativa ANTES de comparar (impede força bruta)
  const [att] = await db.update(operations).set({ confirmationAttempts: op.confirmationAttempts + 1 }).where(and(eq(operations.id, op.id), eq(operations.confirmationAttempts, op.confirmationAttempts), lt(operations.confirmationAttempts, MAX_CODE_ATTEMPTS)));
  if (att.affectedRows !== 1) {
    await db.update(operations).set({ confirmationCodeHash: null }).where(eq(operations.id, op.id));
    throw new AppError("forbidden", "Muitas tentativas de código. Gere um novo código no AdsPilot.");
  }
  const given = Buffer.from(codeHash(op.id, String(code)), "hex"), real = Buffer.from(op.confirmationCodeHash, "hex");
  if (!timingSafeEqual(given, real)) throw new AppError("forbidden", "Código de confirmação incorreto.");
  // uso único: consome o código de forma atômica
  const [used] = await db.update(operations).set({ confirmationCodeHash: null }).where(and(eq(operations.id, op.id), eq(operations.confirmationCodeHash, op.confirmationCodeHash)));
  if (used.affectedRows !== 1) throw new AppError("conflict", "Código já utilizado.");
  return executeOperation(actor, operationId, input, opts);
}
