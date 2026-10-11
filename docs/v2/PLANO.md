# Plano de execução (prioridade: o que não depende de terceiros)

| Etapa | Entrega principal | Depende de externo? |
|---|---|---|
| 01 | Auditoria do AdsPilot e do AdFlow, matriz, plano | não (feito) |
| 02 | Fundação: páginas de erro/carregamento/404, ESLint, revisão de segurança/CSP, jobs/cron HTTP, requestId, `loading` | não |
| 03 | Gestão operacional: orçamento planejado/pacing/projeção/marcos/simulação, pastas e etiquetas, públicos e presets, biblioteca de criativos, assistente + rascunhos, UTMs, checklists, simuladores, experimentos, metas, hierarquia (conjunto/anúncio) | não |
| 04 | Inteligência: métricas (leads/CPL/CPA/conversão), snapshots, alertas configuráveis, diagnósticos estruturados, relatórios ampliados, operações em lote, notificações internas, MCP ampliado | não (IA generativa: chave) |
| 05 | Integrações preparadas: provedor Graph (campos novos, pixels, públicos, targeting), OAuth, renovação de token, rate-limit, WhatsApp/Evolution (testado em servidor simulado), documentação de credenciais | preparo = não; validação real = sim |
| 06 | Ativação real (Meta, escrita, lote, MCP escrita, WhatsApp) | **sim — bloqueada** |
| 07 | Testes finais, segurança, desempenho, documentação, checklist | produção = sim |
