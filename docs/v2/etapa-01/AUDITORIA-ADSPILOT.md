# Etapa 01/07 — Auditoria do AdsPilot (estado real, 11/10/2026)

Base auditada: branch `claude/adspilot-v2` (contém todo o trabalho anterior). Método: leitura do código, testes automatizados, E2E em navegador e inspeção do banco. **"Validada" significa: testes automatizados + E2E, em ambiente de demonstração (dados simulados).** Nada foi validado contra a Meta real.

## Números
Next.js 16 · React 19 · TypeScript · Tailwind 4 · MySQL/MariaDB (Drizzle, 7 migrações) · 22 tabelas · 21 páginas · 7 rotas de API · ~5,6 mil linhas de aplicação · ~2,7 mil de testes/scripts · 119 testes automatizados · 9 suítes E2E · `npm audit` produção: 0 vulnerabilidades.

## Classificação das funcionalidades (categorias do prompt)
Legenda: **1** implementada e validada · **2** implementada, não validada · **3** parcial · **4** simulada/demonstrativa · **5** quebrada · **6** inexistente · **7** bloqueada por dependência externa.

| Funcionalidade | Cat. | Evidência / observação |
|---|---|---|
| Cadastro, login, logout, sessões, troca/reset de senha | 1 | testes + E2E. **Envio do e-mail de reset: 7 (SMTP)** |
| Organizações, perfis (Admin/Gestor/Analista), isolamento multiempresa | 1 | matriz de 22 ataques + testes + E2E |
| Acesso restrito por conta de anúncios, por pessoa | 1 | 11 testes + E2E |
| Clientes (CRUD) | 1 | |
| Auditoria / histórico de atividades | 1 | usuário, objeto, antes/depois, resultado |
| Conta do usuário, exportar/excluir dados (LGPD), minutas legais | 1 / 3 | minutas sem revisão jurídica (7) |
| Logo da empresa nos relatórios | 1 | |
| Provedor de dados **Demonstração** | 4 | por desenho, sinalizado na UI |
| Provedor **Graph API real** (leitura), OAuth | 2 + 7 | testado só com respostas simuladas; v25.0; sem app Meta |
| Sincronização (lock, retentativas, retomada, parcial, idempotente) | 1 (simulada) / 7 (real) | |
| Painel: gasto, resultados, custo/resultado, CTR, ROAS, comparação, gráficos, atenção | 3 | **faltam** leads/CPL/CPA separados, orçamento planejado × realizado, ritmo, projeção, alcance/frequência (só 1 dia), filtro por objetivo no painel |
| Campanhas (lista, busca, ordenação, filtros, colunas, paginação) | 1 | |
| Detalhe da campanha / conjuntos / anúncios | 3 | sem lance, datas, segmentação, posicionamentos; sem métricas por conjunto/anúncio |
| Hierarquia Org → Cliente → Conta → Campanha → Conjunto → Anúncio | 3 | estrutura existe; campos do conjunto/anúncio são mínimos |
| Operações pausar/reativar/orçamento (preparar→confirmar→verificar) | 4 (simulada) / 7 (real) | **escrita na Meta real bloqueada de propósito** |
| Relatórios PDF/XLSX/CSV com verificação, modelos, histórico | 1 | dados simulados |
| MCP leitura/escrita com código humano | 1 (cliente SDK) | não testado em assistentes reais; sem OAuth |
| Saúde da integração, histórico de sync, `/api/health` | 1 | |
| Backup/restauração, desempenho, segurança (E2E) | 1 | local, não na hospedagem |
| Controle de orçamento (planejado, limites, ritmo, projeção, marcos, simulação) | **6** | hoje só a tabela "orçamento × gasto × estimativa" |
| Alertas configuráveis (regras, limites, severidade, frequência, responsáveis, dedupe) | **6** | hoje só "Precisa de atenção" fixo |
| Metas (CPA/ROAS/gasto) | **6** | |
| Snapshots de métricas e histórico comparável | **6** | `insights_daily` é série diária revisável; não há snapshot imutável |
| Diagnósticos/recomendações com IA | 3 | análise **por regras** (fato/hipótese/recomendação); sem modelo de linguagem; sem nível de confiança |
| Assistente de criação de campanhas, rascunhos | **6** | |
| Públicos / segmentação / presets / bibliotecas | **6** | |
| Biblioteca de criativos e prévias | **6** | |
| Pastas, etiquetas, visualizações salvas | **6** | |
| Construtor de UTMs | **6** | |
| Checklists operacionais | **6** | |
| Simuladores | **6** | |
| Experimentos / testes de performance | **6** | |
| Operações em lote | **6** | |
| Pixels, eventos, rastreamento | **6** (+7 para dados reais) | |
| Notificações / WhatsApp (Evolution API) / relatórios periódicos | **6** (+7 para envio real) | |
| Acompanhamento de custos operacionais | **6** | |
| Convites por e-mail, 2FA, verificação de e-mail | 6 / 7 | |
| Estados de erro/carregamento/404 próprios | **6** | **não existem** `error.tsx`, `loading.tsx`, `not-found.tsx` |
| Lint (ESLint) | **6** | sem configuração |
| Funcionalidades quebradas | **5: nenhuma detectada** | 119 testes + 9 E2E verdes |

## Problemas prioritários encontrados
1. **Sem páginas de erro, carregamento e 404** — erro inesperado mostra a página genérica do Next; 404 sem identidade visual. (Etapa 02)
2. **Sem ESLint** (qualidade estática só por `tsc`). (Etapa 02)
3. **Lacunas funcionais grandes** (linhas "6" acima) — escopo das Etapas 03–05.
4. Segurança já documentada em `docs/SEGURANCA.md`: CSP sem `script-src`; limitadores em memória; link de reset em `email_outbox`; sem 2FA. (Etapa 02/07)
5. Desempenho medido só localmente. (Etapa 07)
6. Hospedagem, SMTP, app Meta, WhatsApp: **dependências externas** (ver `DEPENDENCIAS-EXTERNAS.md`).

## Prints reais (aplicação em execução, modo demonstração)
`docs/v2/etapa-01/prints/`: `01-login`, `02-painel`, `03-campanhas`, `04-detalhe-campanha`, `05-operacoes`, `06-relatorios`, `07-integracoes`, `08-equipe`, `09-configuracoes`, `10-assistentes-mcp`, `11-atividades`, `12-clientes`, `13-mobile-painel`.
