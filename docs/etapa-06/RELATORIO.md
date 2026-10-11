# Etapa 06/07 — MCP próprio (leitura e escrita controlada) e avaliação de MCPs auxiliares

**Status: concluído e testado com o cliente MCP oficial (SDK) por HTTP real, sobre dados do modo DEMONSTRAÇÃO. Nenhuma escrita na Meta real (bloqueada).**

## MCP próprio — `POST /api/mcp` (Streamable HTTP, sem estado)
Contratos completos em `docs/mcp.md`.
- **Fase 1 — leitura (16 ferramentas):** organizações, clientes, contas, campanhas, detalhes, conjuntos, anúncios, métricas, comparação de períodos, gasto e orçamento, problemas de entrega, saúde da integração, status de sincronização, relatórios, `get_report` e `analyze_campaign_performance`. Toda resposta informa período, organização/cliente/conta, origem dos dados, última sincronização, desatualização e limitações; ausência de dados é informada (null ≠ zero).
- **Fase 2 — escrita controlada (8 ferramentas):** preparar pausa/reativação/orçamento, executar, verificar, cancelar, consultar. **O assistente não se autoconfirma**: `execute_operation` exige um **código gerado por uma pessoa na interface web** (autor ou admin; 10 min, 5 tentativas, uso único, comparação em tempo constante). Antes de executar: revalida o estado remoto; depois: verifica no remoto. `clientRequestId` deduplica; resultado incerto → `ambiguous` + `verify_operation_result` (só lê).
- **Segurança:** token por usuário+organização (hash SHA-256; valor mostrado uma vez), escopos `read`/`write` ∩ papel do usuário, autorização a cada requisição (membro ativo), revogação imediata, expiração (30/90/365 d), limites 120 leituras/20 escritas por minuto por token e 600/min por IP, tamanho máximo, bloqueio de `Origin` de navegador, GET/DELETE = 405, auditoria de cada chamada sem segredos (código de confirmação nunca gravado), tokens da Meta nunca expostos, texto de campanhas tratado como dado não confiável (caracteres de controle removidos + aviso em toda resposta).
- Interface: **Assistentes (MCP)** (criar/revogar tokens) e botão **Gerar código para o assistente** na operação.
- Migração `0004`: `mcp_tokens` e colunas de origem/confirmação/idempotência em `operations`.

## Testes (reais)
- Vitest **97/97** (15 novos do MCP, usando o `Client` oficial do SDK): listagem de ferramentas e anotações; envelope de contexto; paridade com os serviços; organização sem dados; 401 (ausente/formato/valor/revogado/expirado/usuário removido); escopo; analista sem escrita; Origin/GET; **isolamento entre organizações**; limite de frequência; auditoria sem segredos; **prompt injection**; fluxo de escrita com código humano, bloqueio por tentativas, expiração, uso único, só autor/admin gera, deduplicação, aumento grande, cancelar, revogar.
- **E2E por HTTP real** (`scripts/e2e-mcp.ts`): cliente MCP oficial conecta ao servidor em execução, lista 24 ferramentas, consulta, prepara; o assistente **não** executa sem o código; a pessoa gera o código no navegador; execução concluída e **verificada**; repetição idempotente; revogação derruba o cliente na hora.
- Regressão: E2E das etapas 02/02b/03/04/05 ✔, axe ✔ (20 telas), `npm audit` 0.

## Avaliação dos MCPs auxiliares (nada foi instalado no produto)
| MCP | Decisão |
|---|---|
| **GitHub MCP** | Já usado neste desenvolvimento (escopo restrito ao repositório, sem segredos). Mantido apenas para desenvolvimento; nenhuma alteração de produção sem aprovação. |
| **Playwright MCP** | Não adotado: os testes E2E já usam a biblioteca Playwright diretamente (reprodutíveis em CI, sem custo). Pode ser útil para exploração manual assistida. |
| **Sentry MCP** | **Não necessário agora.** Sem tráfego/produção para justificar; há logs JSON estruturados. Reavaliar após a publicação (custo, privacidade de dados de clientes, permissões). |
| **MCP de banco** | Não usado. Em produção, só pelos serviços do AdsPilot (nunca SQL direto). |

## Limitações e riscos
- Testado com o **cliente do SDK oficial**, não com Claude Desktop/Claude.ai/Cursor reais; compatibilidade de autenticação por cabeçalho Bearer depende do cliente (alguns exigem OAuth para servidores remotos — **não implementado**, seria trabalho futuro).
- Hospedagem: exige Node persistente com HTTPS; a Hostinger não foi validada.
- Limitadores em memória (1 processo).
- Escrita só em ambiente simulado. Sem ferramentas para criar campanhas/anúncios nem editar criativos.
- Nada impede o usuário de repassar o código a um assistente sem ler a alteração: a barreira é humana, por desenho.
