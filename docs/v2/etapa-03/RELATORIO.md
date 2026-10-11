# AdsPilot v2 — Etapa 03/07: Gestão operacional

Modo de teste: **DEMONSTRAÇÃO** (dados simulados e identificados como tal). Nenhuma operação real na Meta foi feita nem simulada como real.

## O que foi entregue

| Módulo | Situação | Observações |
|---|---|---|
| Menu agrupado | ✔ | Gestão / Planejamento / Biblioteca / Ferramentas / Análise / Sistema; barra lateral rola em telas baixas |
| Hierarquia campanha → conjunto → anúncio | ✔ | Conjuntos mostram otimização, estratégia de lance, veiculação e segmentação (campos lidos da Meta; "—" = não informado) |
| Orçamento planejado | ✔ | Cliente/conta/campanha × mês; gasto **reportado**; ritmo linear; projeção (≥ 3 dias de dado); marcos; histórico em auditoria; simulação de redistribuição com premissas |
| Metas | ✔ | CPA, CPL, ROAS, CTR, CPC, CPM, gasto, resultados; sem dado ≠ atingida; amostra mínima 1.000 impressões |
| Pastas e etiquetas | ✔ | Organização local (não existe na Meta) |
| Públicos | ✔ | Versões, comparação campo a campo, modelos por objetivo, alcance só como estimativa informada com fonte |
| Criativos | ✔ | Galeria com prévia local (PNG/JPEG validado por conteúdo), vídeo por link, variações, vínculo manual com campanhas, avisos de qualidade |
| Rascunhos + assistente (10 etapas) | ✔ | Convenção de nomes, validação por etapa, revisão com pendências, **nasce PAUSADO**, envio à Meta **bloqueado** (tentativa auditada) |
| UTMs | ✔ | Modelos, padrões `{campanha} {cliente} {data} {criativo}`, histórico, CSV (neutraliza fórmulas) |
| Checklists | ✔ | 3 listas, estado por item com autor/data |
| Simuladores | ✔ | Resultados, orçamento-meta, ROAS de equilíbrio, CPA máximo, funil — todos com premissas |
| Experimentos | ✔ | Hipótese/variável/métrica; teste de 2 proporções para CTR e conversão; sem vencedor sem amostra; custo/ROAS só descritivo |
| Acesso restrito | ✔ | Itens de cliente invisíveis para quem não tem a conta; escrita na biblioteca/orçamentos/metas é da organização inteira (negada a membros restritos) |

## Arquivos principais
`src/db/schema.ts` + `drizzle/0007_*.sql`; `src/lib/{pacing,naming,utm,draft,checklists,experiments,simulators,targeting}.ts`; `src/server/{budget,goals,library}.ts`; páginas em `src/app/app/{orcamentos,metas,pastas,publicos,criativos,rascunhos,utm,checklists,simuladores,experimentos}`; rotas `api/criativos/[id]/imagem` e `api/utm/exportar`; testes `tests/{budget-goals,libs-v2,library,hierarchy}.test.ts`; E2E `scripts/e2e-gestao.ts`.

## Ideias reaproveitadas do AdFlow (sem copiar arquitetura)
Convenção de nomes, esquemas de segmentação/entrega, pastas/presets, modelo de criativo, regra "nasce pausado". Reimplementadas do zero neste projeto.

## Testes
Executados nesta etapa (resultado real):
- TypeScript sem erros; ESLint 0 problemas.
- Vitest: 17 arquivos, **159 testes passando** (inclui orçamento/metas, bibliotecas, públicos, criativos, rascunhos, UTM, checklists, experimentos, isolamento entre organizações e acesso restrito).
- E2E em navegador (Playwright, app em produção local): e2e, conta, meta, ops, reports, mcp, security, acesso, logo, fundação e **gestão (novo)** — todos OK. O E2E de gestão confirma também **zero violações de CSP** nas telas novas.
- axe-core (WCAG A/AA): 0 violações automáticas nas 10 telas novas (um defeito real foi achado e corrigido: o menu agrupado ultrapassava a altura da barra lateral).
- Prints reais em `docs/v2/etapa-03/prints/` (17 telas).
- Limite: axe não substitui teste manual com leitor de tela.

## Pendências e limites declarados
- **Envio de rascunho à Meta e criação de públicos na Meta**: bloqueados — dependem da Etapa 06 (credenciais Meta reais).
- Filtros adicionais do painel por objetivo: já existem filtros por período/cliente/conta; filtro por objetivo permanece em Campanhas (a evoluir na Etapa 04).
- CPA e CPL ainda usam o mesmo "custo por resultado"; a distinção por tipo de evento (leads × compras) entra na Etapa 04.
- Imagens de criativos ficam no banco (até ~1 MB cada); vídeo é apenas link.
- Hospedagem, Meta App, SMTP: bloqueios externos (ver `docs/v2/etapa-01/DEPENDENCIAS-EXTERNAS.md`).
