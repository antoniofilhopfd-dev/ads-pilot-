// Contrato entre o AdsPilot e qualquer fonte de dados da Meta.
// Valores `null` = a fonte NÃO informou o dado (nunca significa zero).

export type RemoteAdAccount = { externalId: string; name: string; currency: string; timezone: string | null; status: string | null };

export type RemoteCampaign = {
  externalId: string; name: string; objective: string | null; status: string | null; effectiveStatus: string | null;
  dailyBudget: number | null; lifetimeBudget: number | null; startTime: Date | null; stopTime: Date | null;
};

export type RemoteAdSet = {
  externalId: string; campaignExternalId: string; name: string; status: string | null; effectiveStatus: string | null;
  optimizationGoal: string | null; dailyBudget: number | null; lifetimeBudget: number | null;
};

export type RemoteAd = { externalId: string; adSetExternalId: string; name: string; status: string | null; effectiveStatus: string | null };

export type RemoteInsight = {
  campaignExternalId: string; date: string; spend: number | null; impressions: number | null; reach: number | null;
  clicks: number | null; results: number | null; resultType: string | null; purchaseValue: number | null;
};

export interface MetaProvider {
  readonly mode: "demo" | "meta";
  listAdAccounts(): Promise<RemoteAdAccount[]>;
  listCampaigns(accountExternalId: string): Promise<RemoteCampaign[]>;
  listAdSets(accountExternalId: string): Promise<RemoteAdSet[]>;
  listAds(accountExternalId: string): Promise<RemoteAd[]>;
  getDailyInsights(accountExternalId: string, since: string, until: string): Promise<RemoteInsight[]>;
}

export type MetaErrorKind = "token_expired" | "permission" | "rate_limit" | "transient" | "unknown";

export class MetaApiError extends Error {
  constructor(public kind: MetaErrorKind, message: string, public code?: number) {
    super(message);
  }
  get retryable() {
    return this.kind === "rate_limit" || this.kind === "transient";
  }
}
