import type { AttentionItem, CampaignRow } from "../insights";
import type { Logo } from "../services/logo";

export const REPORT_TYPES = ["executive", "campaigns", "client", "account", "spend_budget", "results_costs", "comparison", "changes", "alerts", "health"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const SECTIONS = ["summary", "kpis", "comparison", "charts", "campaigns", "variations", "breakdown", "budget", "alerts", "changes", "health", "recommendations", "methodology"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const TYPE_LABEL: Record<ReportType, string> = {
  executive: "Resumo executivo", campaigns: "Desempenho de campanhas", client: "Desempenho por cliente", account: "Desempenho por conta",
  spend_budget: "Gastos e orçamentos", results_costs: "Resultados e custos", comparison: "Comparação entre períodos",
  changes: "Alterações relevantes", alerts: "Alertas", health: "Saúde das integrações",
};
export const SECTION_LABEL: Record<SectionId, string> = {
  summary: "Resumo (fatos, hipóteses e recomendações)", kpis: "Indicadores principais", comparison: "Comparação com período anterior", charts: "Gráficos",
  campaigns: "Tabela de campanhas", variations: "Variações relevantes", breakdown: "Quebra por cliente/conta", budget: "Orçamento e gasto",
  alerts: "Alertas", changes: "Alterações (operações)", health: "Saúde da integração", recommendations: "Limitações e recomendações", methodology: "Metodologia e origem das métricas",
};

export const DEFAULT_SECTIONS: Record<ReportType, SectionId[]> = {
  executive: ["summary", "kpis", "comparison", "charts", "campaigns", "variations", "alerts", "recommendations", "methodology"],
  campaigns: ["kpis", "campaigns", "recommendations", "methodology"],
  client: ["kpis", "comparison", "breakdown", "campaigns", "charts", "recommendations", "methodology"],
  account: ["kpis", "comparison", "breakdown", "campaigns", "charts", "recommendations", "methodology"],
  spend_budget: ["kpis", "budget", "charts", "recommendations", "methodology"],
  results_costs: ["kpis", "campaigns", "charts", "recommendations", "methodology"],
  comparison: ["kpis", "comparison", "variations", "recommendations", "methodology"],
  changes: ["changes", "methodology"],
  alerts: ["alerts", "recommendations", "methodology"],
  health: ["health", "methodology"],
};

export type ReportConfig = { type: ReportType; days: 7 | 30 | 90; clientId?: string; accountId?: string; sections: SectionId[] };

export type Fmt = "money" | "int" | "pct" | "ratio";
export type Kpi = { key: string; label: string; value: number | null; prev: number | null; change: number | null; format: Fmt; lowerIsBetter?: boolean };

export type Report = {
  config: ReportConfig;
  title: string;
  meta: {
    organization: string; client: string | null; account: string | null; since: string; until: string; prevSince: string; prevUntil: string;
    generatedAt: Date; lastSyncedAt: Date | null; stale: boolean; isDemo: boolean; currency: string; mixedCurrency: boolean;
    coverageSince: string | null; prevComparable: boolean; partialCurrent: boolean; hasData: boolean;
    logo: Logo | null; // logo da empresa (organização), quando cadastrada
  };
  kpis: Kpi[];
  daily: { date: string; spend: number | null; results: number | null; impressions: number | null; clicks: number | null }[];
  campaigns: (CampaignRow & { clientName: string | null })[];
  variations: { name: string; metric: string; curr: number | null; prev: number | null; change: number; format: Fmt }[];
  breakdown: { label: string; spend: number | null; results: number | null; costPerResult: number | null; ctr: number | null }[];
  budget: { campaign: string; configuredDaily: number | null; spend: number | null; avgDaily: number | null; projected30: number | null }[];
  alerts: AttentionItem[];
  changes: { at: Date; what: string; who: string | null; mode: string; result: string }[];
  health: { state: string; instructions: string[]; accounts: { name: string; lastSuccess: Date | null; stale: boolean; lastStatus: string | null }[] };
  facts: string[]; hypotheses: string[]; recommendations: string[]; limitations: string[]; methodology: string[];
};
