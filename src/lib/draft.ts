import { validateName } from "./naming";
import { buildUtmUrl } from "./utm";

export const OBJECTIVES = { OUTCOME_SALES: "Vendas", OUTCOME_LEADS: "Cadastros (leads)", OUTCOME_TRAFFIC: "Tráfego", OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_APP_PROMOTION: "Promoção de app" } as const;
export const BID_STRATEGIES = { LOWEST_COST_WITHOUT_CAP: "Menor custo (sem limite)", COST_CAP: "Limite de custo", LOWEST_COST_WITH_BID_CAP: "Limite de lance", LOWEST_COST_WITH_MIN_ROAS: "ROAS mínimo" } as const;
export const SPECIAL_CATEGORIES = { NONE: "Nenhuma", CREDIT: "Crédito", EMPLOYMENT: "Emprego", HOUSING: "Moradia", SOCIAL_ISSUES_ELECTIONS_POLITICS: "Temas sociais, eleições ou política" } as const;

export const WIZARD_STEPS = [
  { n: 1, title: "Cliente e conta" }, { n: 2, title: "Objetivo" }, { n: 3, title: "Campanha" }, { n: 4, title: "Conjunto de anúncios" }, { n: 5, title: "Público" },
  { n: 6, title: "Posicionamentos" }, { n: 7, title: "Criativo" }, { n: 8, title: "Destino e UTMs" }, { n: 9, title: "Revisão" }, { n: 10, title: "Envio" },
] as const;

export type DraftData = {
  clientId?: string; adAccountId?: string; objective?: string;
  campaignName?: string; budgetMode?: "cbo" | "abo"; campaignDailyBudget?: number; specialCategory?: string;
  adSetName?: string; dailyBudget?: number; bidStrategy?: string; bidAmount?: number; startDate?: string; endDate?: string;
  audienceId?: string; locations?: string; ageMin?: number; ageMax?: number;
  placements?: "automatic" | "manual"; placementList?: string;
  creativeId?: string; adName?: string;
  destinationUrl?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string;
  reviewed?: boolean;
};
export type Issue = { step: number; field: string; message: string };

const today = () => new Date().toISOString().slice(0, 10);

export function validateDraft(d: DraftData, now = today()): Issue[] {
  const i: Issue[] = [];
  const add = (step: number, field: string, message: string) => i.push({ step, field, message });
  if (!d.adAccountId) add(1, "adAccountId", "Escolha a conta de anúncios.");
  if (!d.objective || !(d.objective in OBJECTIVES)) add(2, "objective", "Escolha o objetivo.");
  const cn = validateName(d.campaignName ?? "", { minParts: 3 }); if (cn) add(3, "campaignName", `Campanha: ${cn}`);
  if (!d.budgetMode) add(3, "budgetMode", "Escolha onde fica o orçamento (campanha ou conjunto).");
  if (d.budgetMode === "cbo" && !(d.campaignDailyBudget && d.campaignDailyBudget > 0)) add(3, "campaignDailyBudget", "Informe o orçamento diário da campanha.");
  const an = validateName(d.adSetName ?? "", { minParts: 3 }); if (an) add(4, "adSetName", `Conjunto: ${an}`);
  if (d.budgetMode === "abo" && !(d.dailyBudget && d.dailyBudget > 0)) add(4, "dailyBudget", "Informe o orçamento diário do conjunto.");
  if (!d.bidStrategy || !(d.bidStrategy in BID_STRATEGIES)) add(4, "bidStrategy", "Escolha a estratégia de lance.");
  else if (d.bidStrategy !== "LOWEST_COST_WITHOUT_CAP" && !(d.bidAmount && d.bidAmount > 0)) add(4, "bidAmount", "Esta estratégia exige o valor do limite/ROAS.");
  if (!d.startDate) add(4, "startDate", "Informe a data de início.");
  else if (d.startDate < now) add(4, "startDate", "A data de início está no passado.");
  if (d.endDate && d.startDate && d.endDate < d.startDate) add(4, "endDate", "A data final é anterior à inicial.");
  if (!d.audienceId && !d.locations?.trim()) add(5, "locations", "Escolha um público salvo ou informe a localização.");
  if (d.ageMin !== undefined && (d.ageMin < 13 || d.ageMin > 65)) add(5, "ageMin", "Idade mínima deve estar entre 13 e 65.");
  if (d.ageMin !== undefined && d.ageMax !== undefined && d.ageMax < d.ageMin) add(5, "ageMax", "Idade máxima menor que a mínima.");
  if (!d.placements) add(6, "placements", "Escolha automáticos ou manuais.");
  if (d.placements === "manual" && !d.placementList?.trim()) add(6, "placementList", "Liste os posicionamentos manuais.");
  if (!d.creativeId) add(7, "creativeId", "Escolha um criativo da biblioteca.");
  if (!d.destinationUrl) add(8, "destinationUrl", "Informe a URL de destino.");
  else { try { buildUtmUrl(d.destinationUrl, { utm_source: d.utmSource || "meta", utm_medium: d.utmMedium || "paid_social", utm_campaign: d.utmCampaign || "x" }); } catch (e) { add(8, "destinationUrl", (e as Error).message); } }
  if (d.specialCategory && d.specialCategory !== "NONE" && d.ageMin !== undefined && d.ageMin > 18) add(5, "ageMin", "Categorias especiais restringem a segmentação por idade: revise as regras da Meta.");
  return i;
}

// Rascunho nasce e é enviado SEMPRE pausado (regra de segurança do AdsPilot).
export const BORN_STATUS = "PAUSED" as const;

export const SEND_BLOCKED_REASON = "O envio para a Meta está bloqueado: não há conexão real com a Meta com permissão de escrita validada (Etapa 06). O rascunho foi salvo localmente e nada foi criado na Meta.";
