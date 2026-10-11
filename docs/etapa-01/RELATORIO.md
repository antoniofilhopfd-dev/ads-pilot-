# AdsPilot — Etapa 01/07: Auditoria e Planejamento

**Status da etapa: concluído (aguardando aprovação). Nenhum código de produto foi escrito.**

## 1. Estado atual do projeto (verificado)

| Item | Resultado |
|---|---|
| Repositório | `antoniofilhopfd-dev/ads-pilot-`, 1 commit ("Initial commit"), só branch `main` |
| Conteúdo | Apenas `README.md` (12 bytes, só o título) |
| Framework / dependências / rotas / componentes / banco / scripts | **Inexistentes** (sem `package.json`) |
| Integração Meta no código | **Inexistente** |
| Variáveis de ambiente | Nenhuma de Meta, banco ou hospedagem definida neste ambiente |
| Hospedagem Hostinger | **Não verificável**: não tenho acesso ao painel nem informação do plano contratado |
| Ambiente de dev disponível | Node 22.22, npm 10.9, Chromium + Playwright 1.56 (para testes de UI) |

Classificação das funcionalidades: **todas inexistentes** (projeto em estágio zero). Não há nada a preservar, quebrado ou simulado.

Limitação declarada: sem acesso à Hostinger, a viabilidade abaixo é **teórica**, baseada nos requisitos do projeto, e precisa ser confirmada por você (ver §4).

## 2. Escopo (obrigatório / importante / futuro / dispensável)

- **Obrigatório p/ lançamento:** auth + recuperação de senha, multi-organização com isolamento testado, perfis (Admin, Gestor, Analista), OAuth Meta + armazenamento seguro de token, sincronização com histórico e saúde da integração, dashboard e campanhas (leitura), auditoria, relatórios essenciais com PDF/XLSX/CSV verificados, backups, publicação e rollback.
- **Importante:** operações de escrita em campanhas (pausar/reativar/orçamento), MCP próprio (leitura), modelos de relatório avançados, observabilidade, convites.
- **Futuro:** MCP de escrita, alertas/anomalias por IA, automações, Google/TikTok/LinkedIn Ads.
- **Dispensável agora:** Sentry MCP, microserviços, indicadores sem uso operacional, animações decorativas.

## 3. Arquitetura recomendada

- **Monólito modular** Next.js (App Router) + React + TypeScript + Tailwind, com camada de serviços de negócio única (usada por UI, API e MCP).
- **Banco:** MySQL (nativo da Hostinger) com ORM/migrações versionadas (ex.: Drizzle ou Prisma). PostgreSQL só se houver necessidade comprovada; exigiria banco externo (custo).
- **Multi-tenancy:** `organization_id` em toda tabela de negócio; verificação de autorização no servidor em cada serviço; testes automatizados de acesso cruzado.
- **Segredos:** tokens Meta criptografados em repouso (AES-GCM, chave em variável de ambiente), nunca enviados ao navegador/logs/MCP.
- **Jobs:** tabela de fila no banco + worker (sync/relatórios) com lock, retry exponencial e retomada; sem Redis no início.
- **Métricas:** armazenar valor nulo quando a Meta não informa (nunca converter para 0); fórmulas documentadas.

## 4. Viabilidade da Hostinger (a validar por você)

Preciso que você informe/confirme o **plano exato**. Pontos críticos:

| Requisito | Risco |
|---|---|
| Next.js com Node persistente | Hospedagem compartilhada/Business suporta apps Node.js (limitado); VPS é mais seguro. |
| Worker em segundo plano / cron | Compartilhada tem cron mas restringe processos longos; VPS resolve. |
| MCP via HTTP (Streamable HTTP) | Viável se o app Node for persistente; stdio local não se aplica a produção. |
| Geração de PDF (Chromium) | Pesado em memória; em plano compartilhado pode falhar → usar PDF por biblioteca leve (pdf-lib/pdfkit) ou VPS. |
| Backups/restauração | Confirmar frequência e se restaura banco isolado. |

**Recomendação provisória:** desenvolver e testar localmente/staging; decidir entre plano atual e VPS Hostinger **somente após** você enviar o plano. Qualquer upgrade de custo será apresentado com alternativas antes de contratar.

## 5. Estratégia Meta

- API oficial (Marketing API, Graph versionada) via OAuth (Facebook Login for Business). Permissões prováveis: `ads_read` (Etapa 03), `ads_management` (Etapa 04), `business_management` se necessário.
- **Risco crítico:** acesso a ativos de terceiros em produção exige **App Review** e verificação de empresa da Meta; leva dias/semanas. Em modo desenvolvimento só funcionam contas de quem é admin/testador do app. Deve começar já.
- Token de longa duração (~60 dias): tratar expiração/revogação, estado "reconexão necessária".
- Insights: respeitar janelas de atribuição, rate limit (cabeçalhos de uso), paginação por cursor, `async reports` para históricos grandes.
- Escrita: idempotência por ID de operação; após erro ambíguo, ler o estado remoto antes de repetir.

## 6. Estratégia de relatórios

Dados de métricas diárias persistidos → relatório é função pura dos dados + metadados (período, última sync, fórmulas). Exportações: CSV (UTF-8 BOM, ponto-e-vírgula opcional), XLSX (exceljs, tipos numéricos, filtros), PDF (pdfkit/pdf-lib ou Chromium se a hospedagem permitir). Cada exportação é gerada e **verificada** (reabrir o arquivo, conferir totais) antes de marcar como concluída. Separar fatos, hipóteses e recomendações.

## 7. Estratégia de MCP

| MCP | Classificação | Observação |
|---|---|---|
| MCP próprio AdsPilot (leitura) | **Necessário (Etapa 06)** | Reusa serviços de negócio; HTTP com token por usuário/escopo, rate limit, auditoria |
| MCP próprio (escrita controlada) | Futuro, após aprovação | Fluxo preparar → confirmar → executar → verificar |
| GitHub MCP | **Necessário agora** (dev) | Já disponível nesta sessão; escopo restrito ao repositório; sem custo |
| Playwright MCP | Importante (Etapa 02+) | Para testes de UI; Playwright já está instalado aqui; contas de teste |
| MCP de banco | Opcional (dev) | Só com dados de teste; nunca escrita em produção |
| Sentry MCP | Opcional/dispensável | Só se houver necessidade real; custo e privacidade a avaliar |

Nenhum MCP será instalado sem sua aprovação.

## 8. Riscos de segurança (priorizados)

1. Vazamento entre organizações → testes de isolamento obrigatórios desde a Etapa 02.
2. Vazamento de tokens Meta → criptografia, redação em logs, nunca no cliente.
3. Prompt injection via nomes/textos de anúncios no MCP → tratar como dado não confiável.
4. Ações de escrita duplicadas/ambíguas → IDs de operação + verificação remota.
5. Alerta interno confundido com limite real de gasto → UI explícita (ver mockup).
6. LGPD: política de privacidade, retenção, exclusão — sem declarar conformidade integral.

## 9. Plano de testes

Unitários (cálculo de métricas, permissões), integração (serviços + MySQL de teste), isolamento multiempresa, sincronização com respostas Meta simuladas **identificadas como simulação**, e2e Playwright (login, filtros, tabelas, responsivo), verificação de exportações, backup/restauração. Testes reais da Meta só com conta de teste.

## 10. Lista priorizada de ações

1. **Você:** informar plano Hostinger, domínio, se já existe app Meta (App ID/Business verificado) e conta de teste.
2. Iniciar verificação de empresa/App Review da Meta (caminho crítico, fora do código).
3. Aprovar proposta visual (prints abaixo).
4. Etapa 02: scaffolding, design system, auth, organizações, perfis, migrações, logs, testes de isolamento.

## 11. Critérios de conclusão da Etapa 01

Diagnóstico entregue ✔ · arquitetura ✔ · riscos ✔ · plano ✔ · proposta visual ✔ · aprovação explícita ⏳.

## 12. Proposta visual (Dashboard, Campanhas, Detalhes, Relatórios)

Mockups estáticos em `docs/etapa-01/mockups/*.html`, prints em `docs/etapa-01/prints/`. **Todos os números são fictícios e marcados "MODO DEMONSTRAÇÃO".** Decisões de UX: valor ausente = "—" (nunca 0); bloco "Orçamento e gasto" separa configurado / informado / previsão / limite interno / limite aplicado; badge de sincronização no topo; ações de escrita ausentes até a Etapa 04.

## Arquivos criados
`docs/etapa-01/RELATORIO.md`, `docs/etapa-01/mockups/{style.css,dashboard,campanhas,detalhe-campanha,relatorios}.html`, `docs/etapa-01/prints/*.png`. Banco de dados: sem alterações. Testes: apenas renderização dos mockups (screenshot) — nenhum teste funcional existe ainda.

## Próxima etapa proposta
Etapa 02/07 — Fundação, após sua aprovação explícita e as respostas do item 10.1.
