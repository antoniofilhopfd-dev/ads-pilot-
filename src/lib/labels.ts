export const STATUS_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Ativa", tone: "ok" },
  PAUSED: { label: "Pausada", tone: "neutral" },
  CAMPAIGN_PAUSED: { label: "Campanha pausada", tone: "neutral" },
  ADSET_PAUSED: { label: "Conjunto pausado", tone: "neutral" },
  ARCHIVED: { label: "Arquivada", tone: "neutral" },
  DELETED: { label: "Excluída", tone: "neutral" },
  LEARNING_LIMITED: { label: "Aprendizado limitado", tone: "warn" },
  WITH_ISSUES: { label: "Com problemas", tone: "warn" },
  PENDING_REVIEW: { label: "Em análise", tone: "warn" },
  IN_PROCESS: { label: "Em processamento", tone: "warn" },
  DISAPPROVED: { label: "Reprovada", tone: "danger" },
};
export const statusInfo = (s: string | null) => (s ? STATUS_LABEL[s] ?? { label: s, tone: "neutral" as const } : { label: "—", tone: "neutral" as const });

export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: "Vendas", OUTCOME_LEADS: "Cadastros", OUTCOME_TRAFFIC: "Tráfego", OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_APP_PROMOTION: "Promoção de app",
};
export const objectiveLabel = (o: string | null) => (o ? OBJECTIVE_LABEL[o] ?? o : "—");

export const RESULT_LABEL: Record<string, string> = { purchase: "compras", lead: "cadastros", link_click: "cliques no link", post_engagement: "engajamentos" };

export const OP_LABEL = { pause: "Pausar", activate: "Reativar", set_daily_budget: "Alterar orçamento diário" } as const;
export const OPSTATUS = {
  prepared: ["neutral", "Aguardando confirmação"], executing: ["warn", "Em execução"], succeeded: ["ok", "Concluída e verificada"],
  failed: ["danger", "Falhou"], ambiguous: ["warn", "Resultado incerto"], expired: ["neutral", "Expirada"], cancelled: ["neutral", "Cancelada"],
} as const;

