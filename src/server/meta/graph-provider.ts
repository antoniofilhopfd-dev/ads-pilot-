import { MetaApiError, type MetaProvider, type RemoteAd, type RemoteAdAccount, type RemoteAdSet, type RemoteCampaign, type RemoteInsight } from "./types";

// Cliente da Graph/Marketing API OFICIAL da Meta (somente leitura).
// ATENÇÃO: ainda NÃO foi validado contra a Meta real (sem app/credenciais). Os testes usam respostas simuladas
// no formato documentado. Antes de produção, validar com uma conta de teste.
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const MAX_PAGES = 200;

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

// Resultado por objetivo (documentado em docs/etapa-03): objetivo sem mapeamento → results = null (não zero).
export const RESULT_ACTION: Record<string, string> = {
  OUTCOME_SALES: "purchase",
  OUTCOME_LEADS: "lead",
  OUTCOME_TRAFFIC: "link_click",
  OUTCOME_ENGAGEMENT: "post_engagement",
};

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const date = (v: unknown): Date | null => (typeof v === "string" && v ? new Date(v) : null);
// Orçamentos da Meta vêm na MENOR unidade da moeda (centavos) como string.
const money = (v: unknown): number | null => (num(v) === null ? null : Number(v) / 100);

export function mapGraphError(status: number, body: Json | undefined): MetaApiError {
  const e = (body?.error ?? {}) as { code?: number; error_subcode?: number; message?: string; is_transient?: boolean };
  const code = e.code;
  const msg = (e.message ?? `Erro HTTP ${status}`).slice(0, 250);
  if (code === 190) return new MetaApiError("token_expired", msg, code);
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) return new MetaApiError("permission", msg, code);
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== undefined && code >= 80000 && code <= 80014)) return new MetaApiError("rate_limit", msg, code);
  if (code === 1 || code === 2 || e.is_transient || status >= 500) return new MetaApiError("transient", msg, code);
  return new MetaApiError("unknown", msg, code);
}

// Percentual de uso informado pela Meta nos cabeçalhos X-App-Usage / X-Business-Use-Case-Usage (maior valor entre os campos conhecidos).
export function usagePercent(headers: Pick<Headers, "get">): number | null {
  let max: number | null = null;
  const scan = (v: unknown) => {
    if (typeof v === "number") max = Math.max(max ?? 0, v);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (["call_count", "total_cputime", "total_time", "acc_id_util_pct"].includes(k)) scan(x); else scan(x);
  };
  for (const h of ["x-app-usage", "x-business-use-case-usage", "x-ad-account-usage"]) {
    const raw = headers.get(h); if (!raw) continue;
    try { scan(JSON.parse(raw)); } catch { /* cabeçalho malformado: ignora */ }
  }
  return max;
}
export const THROTTLE_AT = 85;

export class GraphApiProvider implements MetaProvider {
  readonly mode = "meta" as const;
  lastUsage: number | null = null; // último uso observado (%)
  constructor(private token: string, private fetchImpl: Fetch = fetch, private base = `https://graph.facebook.com/${GRAPH_VERSION}`, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  private async get(path: string, params: Record<string, string>): Promise<Json> {
    const url = new URL(path.startsWith("http") ? path : `${this.base}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      // Token no cabeçalho (não na URL) para não vazar em logs de proxy.
      res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.token}` } });
    } catch {
      throw new MetaApiError("transient", "Falha de rede ao contatar a Meta.");
    }
    const body = (await res.json().catch(() => undefined)) as Json | undefined;
    this.lastUsage = usagePercent(res.headers);
    if (!res.ok || body?.error) throw mapGraphError(res.status, body);
    // Perto do limite: espera antes da próxima chamada em vez de bater no bloqueio (o sync também tem retry com espera).
    if (this.lastUsage !== null && this.lastUsage >= THROTTLE_AT) await this.sleep(Math.min(30_000, (this.lastUsage - THROTTLE_AT + 1) * 1000));
    return body ?? {};
  }

  private async paged(path: string, params: Record<string, string>): Promise<Json[]> {
    const rows: Json[] = [];
    let next: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const body = await this.get(next ?? path, next ? {} : { limit: "100", ...params });
      rows.push(...((body.data as Json[]) ?? []));
      next = (body.paging as { next?: string } | undefined)?.next;
      if (!next) return rows;
      if (new URL(next).protocol !== "https:" || !new URL(next).hostname.endsWith("facebook.com")) throw new MetaApiError("unknown", "URL de paginação inesperada.");
    }
    throw new MetaApiError("unknown", "Paginação excedeu o limite de segurança.");
  }

  async listAdAccounts(): Promise<RemoteAdAccount[]> {
    const rows = await this.paged("me/adaccounts", { fields: "account_id,name,currency,timezone_name,account_status" });
    return rows.map((r) => ({ externalId: `act_${r.account_id}`, name: String(r.name ?? r.account_id), currency: String(r.currency ?? "USD"), timezone: (r.timezone_name as string) ?? null, status: r.account_status === undefined ? null : String(r.account_status) }));
  }

  async listCampaigns(acct: string): Promise<RemoteCampaign[]> {
    const rows = await this.paged(`${acct}/campaigns`, { fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time" });
    return rows.map((r) => ({ externalId: String(r.id), name: String(r.name), objective: (r.objective as string) ?? null, status: (r.status as string) ?? null, effectiveStatus: (r.effective_status as string) ?? null, dailyBudget: money(r.daily_budget), lifetimeBudget: money(r.lifetime_budget), startTime: date(r.start_time), stopTime: date(r.stop_time) }));
  }

  async listAdSets(acct: string): Promise<RemoteAdSet[]> {
    const rows = await this.paged(`${acct}/adsets`, { fields: "id,campaign_id,name,status,effective_status,optimization_goal,daily_budget,lifetime_budget,bid_strategy,start_time,end_time,targeting" });
    return rows.map((r) => ({ externalId: String(r.id), campaignExternalId: String(r.campaign_id), name: String(r.name), status: (r.status as string) ?? null, effectiveStatus: (r.effective_status as string) ?? null, optimizationGoal: (r.optimization_goal as string) ?? null, dailyBudget: money(r.daily_budget), lifetimeBudget: money(r.lifetime_budget), bidStrategy: (r.bid_strategy as string) ?? null, startTime: date(r.start_time), endTime: date(r.end_time), targeting: r.targeting && typeof r.targeting === "object" ? (r.targeting as Record<string, unknown>) : null }));
  }

  async listAds(acct: string): Promise<RemoteAd[]> {
    const rows = await this.paged(`${acct}/ads`, { fields: "id,adset_id,name,status,effective_status" });
    return rows.map((r) => ({ externalId: String(r.id), adSetExternalId: String(r.adset_id), name: String(r.name), status: (r.status as string) ?? null, effectiveStatus: (r.effective_status as string) ?? null }));
  }

  async getDailyInsights(acct: string, since: string, until: string): Promise<RemoteInsight[]> {
    // Objetivo de cada campanha, para saber qual ação conta como "resultado".
    const camps = await this.listCampaigns(acct);
    const objective = new Map(camps.map((c) => [c.externalId, c.objective]));
    const rows = await this.paged(`${acct}/insights`, {
      level: "campaign", time_increment: "1", time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,spend,impressions,reach,clicks,actions,action_values",
    });
    return rows.map((r) => {
      const id = String(r.campaign_id);
      const type = RESULT_ACTION[objective.get(id) ?? ""] ?? null;
      const find = (list: unknown, t: string) => (Array.isArray(list) ? (list as { action_type: string; value: string }[]).find((a) => a.action_type === t || a.action_type === `omni_${t}`) : undefined);
      const hit = type ? find(r.actions, type) : undefined;
      const val = type === "purchase" ? find(r.action_values, "purchase") : undefined;
      return {
        campaignExternalId: id, date: String(r.date_start), spend: num(r.spend), impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks),
        // Meta omite "actions" quando não houve ação: sem informação ≠ zero → null.
        results: hit ? num(hit.value) : null, resultType: hit ? type : null, purchaseValue: val ? num(val.value) : null,
      };
    });
  }

  // ── Leituras auxiliares (somente leitura; usadas pelo assistente e pela biblioteca) ──
  async listPixels(acct: string): Promise<{ id: string; name: string; lastFiredAt: Date | null }[]> {
    const rows = await this.paged(`${acct}/adspixels`, { fields: "id,name,last_fired_time" });
    return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), lastFiredAt: date(r.last_fired_time) }));
  }
  // Eventos recebidos pelo pixel (agregado por hora/evento). Sem dado ≠ zero: lista vazia significa que a Meta não devolveu eventos.
  async getPixelEvents(pixelId: string, since: string): Promise<{ event: string; count: number }[]> {
    const rows = await this.paged(`${pixelId}/stats`, { aggregation: "event", start_time: since });
    const sums = new Map<string, number>();
    for (const r of rows) for (const d of (Array.isArray(r.data) ? r.data : []) as { value?: string; count?: number }[]) if (d.value) sums.set(d.value, (sums.get(d.value) ?? 0) + (num(d.count) ?? 0));
    return [...sums.entries()].map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count);
  }
  async searchTargeting(q: string, type: "adinterest" | "adgeolocation" | "adworkposition" = "adinterest"): Promise<{ id: string; name: string; audienceSize: number | null }[]> {
    if (!q.trim() || q.length > 100) throw new MetaApiError("unknown", "Termo de busca inválido.");
    const body = await this.get("search", { type, q: q.trim(), limit: "25" });
    return ((body.data as Json[]) ?? []).map((r) => ({ id: String(r.id ?? r.key), name: String(r.name), audienceSize: num(r.audience_size_upper_bound ?? r.audience_size) }));
  }
  async listCustomAudiences(acct: string): Promise<{ id: string; name: string; subtype: string | null; approximateCount: number | null }[]> {
    const rows = await this.paged(`${acct}/customaudiences`, { fields: "id,name,subtype,approximate_count_lower_bound" });
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), subtype: (r.subtype as string) ?? null, approximateCount: num(r.approximate_count_lower_bound) }));
  }
}
