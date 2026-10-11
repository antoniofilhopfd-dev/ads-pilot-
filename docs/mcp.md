# AdsPilot MCP — contrato das ferramentas

Servidor MCP próprio do AdsPilot (**Streamable HTTP, sem estado**), em `POST {APP_URL}/api/mcp`. Usa **os mesmos serviços de negócio** do aplicativo (autorização, validações, isolamento por organização e auditoria): não substitui a API da Meta nem concede permissões que o usuário não tem.

## Autenticação e segurança
- Cabeçalho `Authorization: Bearer adp_mcp_…`. Token criado em **Assistentes (MCP)**; valor mostrado **uma vez**, no banco só o hash SHA-256.
- Token = 1 usuário + 1 organização + escopos (`read`, `write`) + validade (30/90/365 dias). Autorização **a cada requisição**: token ativo **e** usuário ainda membro; revogação vale na requisição seguinte.
- Efetivo = papel do usuário ∩ escopo do token. `write` só para quem tem `campaigns.write` (admin/gestor).
- Limites: 120 leituras/min e 20 escritas/min por token; 600 req/min por IP; 100 KB por requisição. `Origin` de navegador diferente do `APP_URL` → 403. `GET`/`DELETE` → 405.
- Auditoria de cada chamada (`mcp.<ferramenta>`, token e argumentos sem segredos; o código de confirmação nunca é gravado).
- Tokens da Meta **nunca** são expostos ao modelo/cliente.
- Textos de campanhas/anúncios são **conteúdo não confiável** (caracteres de controle removidos; aviso em toda resposta). Nenhuma ferramenta interpreta esses textos como instrução.

## Envelope de resposta (leitura)
```json
{ "ok": true,
  "context": { "organization": {"id","name"}, "filters": {"clientId","accountId"}, "period": {"days","since","until"},
               "dataSource": "DEMONSTRAÇÃO (dados simulados…) | Meta Marketing API (sincronizado…) | sem conexão",
               "lastSyncedAt": "ISO|null", "dataIsStale": false, "currency": "BRL", "limitations": ["…"], "notice": "…" },
  "data": …, "pagination": {"page","pageSize","total","pages"} }
```
Erro: `{"ok":false,"error":{"code":"forbidden|not_found|validation|conflict|rate_limited|unauthenticated|internal","message":"…"}}` com `isError: true`. Valores `null` = a Meta não informou (nunca zero). Sem dados → a ausência é informada.

## Fase 1 — Leitura (escopo `read`)
| Ferramenta | Entrada | Saída (`data`) |
|---|---|---|
| `list_organizations` | — | organização do token + papel |
| `list_clients` | `page,pageSize` | clientes |
| `list_ad_accounts` | `clientId?,accountId?,page,pageSize` | contas, se acompanhadas, última sync |
| `list_campaigns` | `clientId?,accountId?,days(7/30/90),status?,objective?,query?,sort,dir,page,pageSize` | campanhas + métricas |
| `get_campaign_details` | `campaignId,days` | campanha, métricas, período anterior, série diária |
| `list_ad_sets` / `list_ads` | `campaignId,page,pageSize` | conjuntos / anúncios e status de entrega |
| `get_performance_metrics` | `clientId?,accountId?,days,groupBy(none/day/campaign)` | totais (+ diário/por campanha) |
| `compare_periods` | `clientId?,accountId?,days` | atual × anterior, variação % (só se o anterior estiver totalmente sincronizado) |
| `get_spend_and_budget` | `clientId?,accountId?,days` | orçamento configurado × gasto da Meta × previsão (estimativa) |
| `get_delivery_issues` | `clientId?,accountId?,days` | problemas observados |
| `get_integration_health` / `get_sync_status` | — / `limit` | saúde e histórico de sincronização |
| `list_reports` / `get_report` | — / `type,days,clientId?,accountId?,sections?` | modelos e exportações / relatório (fatos, hipóteses não comprovadas, recomendações, limitações) |
| `analyze_campaign_performance` | `campaignId,days` | análise por regras; não executa nada |
| `list_operations` / `get_operation` | `limit` / `operationId` | histórico / estado (com verificação) |

## Fase 2 — Escrita controlada (escopo `write` + permissão `campaigns.write`)
Fluxo obrigatório: consultar → **preparar** (nada muda) → mostrar atual × novo e avisos ao usuário → **o usuário gera o código** na tela da operação do AdsPilot → `execute_operation` com o código → executa **uma vez** → **verifica no remoto** → auditoria → resultado real.

| Ferramenta | Entrada | Observações |
|---|---|---|
| `prepare_campaign_pause` / `prepare_campaign_activation` | `campaignId, clientRequestId?` | só campanha ativa / pausada |
| `prepare_daily_budget_change` | `campaignId, dailyBudget, clientRequestId?` | 1–1.000.000; aumento > 50% exige `acknowledgeLargeChange` |
| `execute_operation` | `operationId, confirmationCode, acknowledgeLargeChange?` | código humano: 10 min, 5 tentativas, uso único; repetir devolve o resultado guardado |
| `verify_operation_result` | `operationId` | resolve resultado incerto **só lendo** o remoto |
| `cancel_operation` | `operationId` | antes de executar |

`clientRequestId` evita duplicidade (mesmo id → mesma operação). Uma recomendação de IA **não** é autorização. **Meta real:** a escrita está bloqueada; hoje só o modo demonstração aceita operações.
