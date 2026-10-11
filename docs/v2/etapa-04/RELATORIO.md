# AdsPilot v2 — Etapa 04/07: Inteligência

Modo de teste: **DEMONSTRAÇÃO**. Alertas e diagnósticos são calculados sobre dados sincronizados; nenhum benchmark de mercado sem fonte é usado.

| Módulo | Situação |
|---|---|
| Métricas por tipo de resultado | ✔ leads/CPL, compras/CPA, taxa de conversão (resultados ÷ cliques); linhas sem tipo informado não entram (null ≠ 0). Alcance/frequência só em 1 dia. |
| Alertas configuráveis | ✔ 8 regras (projeção/estouro de orçamento, meta não atingida, sem entrega, custo subiu, CTR caiu, frequência alta, dados desatualizados); limiares, mínimos de amostra, responsáveis e reaviso por organização; auditoria da configuração |
| Estado e deduplicação | ✔ aberto → reconhecido → resolvido → reaberto (mesmo alerta); reavaliar não duplica; reaviso só após o prazo |
| Notificações internas | ✔ sino + página; só para quem enxerga a conta do alerta |
| Diagnósticos | ✔ por regras: observação, período, dados, comparação, hipótese (sempre "não comprovada"), confiança, recomendação, riscos, próxima ação; amostra pequena ⇒ sem hipótese |
| IA/LLM | ⛔ adaptador declarado **indisponível** (sem chave). Nada é inventado. |
| Comparações | ✔ período × anterior e campanha × campanha (bloqueia moedas diferentes) |
| Ações em lote | ✔ **prepara** pausa/reativação; cada operação continua exigindo confirmação individual |
| Relatórios | ✔ executivo inclui leads/CPL/CPA/conversão e alertas persistidos |
| MCP (leitura) | ✔ `list_alerts`, `list_budgets`, `list_goals`, `get_campaign_diagnostics` |
| Snapshots | O histórico diário já é persistido (`insights_daily`, idempotente); alertas guardam primeira/última ocorrência. Não há tabela de "snapshots" separada. |

## Testes (resultado real)
Vitest 175 testes OK (inclui `alerts.test.ts` 15 e `mcp-intel.test.ts`); E2E `e2e-inteligencia.ts` OK sem violações de CSP; prints em `docs/v2/etapa-04/prints/`.

## Limites
- Regras usam janelas de 7 dias; podem refletir variação normal — o diagnóstico diz isso.
- Envio de alertas por e-mail/WhatsApp: depende de SMTP/Evolution (Etapa 05 prepara o adaptador; real é Etapa 06).
- Métricas por conjunto/anúncio ainda não são sincronizadas (só campanha).
