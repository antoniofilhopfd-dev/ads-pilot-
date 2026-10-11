import { AppError } from "@/lib/errors";
import { diagnose } from "@/lib/analysis";
import { loadFacts } from "./analysis";
import { getAlertConfig } from "./alerts";
import { assertCan, type Actor } from "./context";

export type LlmStatus = { available: boolean; reason: string };
// Adaptador de IA: NÃO configurado nesta versão (depende de chave de API — Etapa 06). Os diagnósticos abaixo são por regras.
export function llmStatus(): LlmStatus {
  return { available: false, reason: "Explicações por IA indisponíveis: nenhuma chave de LLM configurada. Os diagnósticos abaixo usam regras transparentes." };
}

export async function campaignDiagnostics(actor: Actor, campaignId: string, now = new Date()) {
  assertCan(actor, "insights.read");
  const cfg = await getAlertConfig(actor.organizationId);
  const [f] = await loadFacts(actor.organizationId, actor.allowedAccountIds, now, { campaignId, noDeliveryDays: cfg.noDeliveryDays });
  if (!f) throw new AppError("not_found", "Campanha não encontrada.");
  return { campaign: { id: f.id, name: f.name, account: f.accountName }, items: diagnose(f, cfg), llm: llmStatus() };
}

export async function accountDiagnostics(actor: Actor, now = new Date()) {
  assertCan(actor, "insights.read");
  const cfg = await getAlertConfig(actor.organizationId);
  const facts = await loadFacts(actor.organizationId, actor.allowedAccountIds, now, { noDeliveryDays: cfg.noDeliveryDays });
  return facts.map((f) => ({ campaign: { id: f.id, name: f.name, account: f.accountName }, items: diagnose(f, cfg) })).filter((x) => x.items.some((i) => i.id !== "estavel"));
}
