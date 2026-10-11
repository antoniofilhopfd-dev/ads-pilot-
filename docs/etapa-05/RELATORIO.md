# Etapa 05/07 — Relatórios

**Status: concluído e testado (dados do modo DEMONSTRAÇÃO; relatórios sobre dados reais da Meta não foram possíveis).**

## Implementado
- 10 tipos: resumo executivo, desempenho de campanhas, por cliente, por conta, gastos e orçamentos, resultados e custos, comparação entre períodos, alterações relevantes, alertas, saúde das integrações.
- Conteúdo (por seção selecionável): organização/cliente, período, data de geração, **data da última sincronização**, KPIs, comparação com período anterior (só se totalmente sincronizado), gráficos, tabela de campanhas, variações ≥ 20%, quebra por cliente/conta, orçamento × gasto × previsão, alertas, alterações (operações), limitações, metodologia e origem das métricas.
- **Fatos × hipóteses × recomendações separados**, por regras (sem IA generativa). Hipóteses só aparecem com evidência nos dados, sempre rotuladas "não comprovada", sem afirmar causa. Limitações explícitas: amostra pequena, cobertura parcial, dados desatualizados, atribuição, moedas mistas, dados simulados.
- Exportações **PDF** (cabeçalho/rodapé em todas as páginas, "Página X de N", tabelas com cabeçalho repetido, gráficos vetoriais), **XLSX** (abas Resumo/Dados/Diário/Análise, números tipados, formatos, filtro, cabeçalho congelado) e **CSV** (UTF-8 BOM, RFC 4180, ausente = vazio, proteção contra injeção de fórmulas).
- **Verificação obrigatória**: cada arquivo é reaberto e conferido (CSV: parser estrito, colunas, totais, ausentes; XLSX: abas, tipos, totais, filtro; PDF: texto extraído com pdfjs — organização, período, última sincronização, gasto total, nomes das campanhas, paginação, aviso de simulação). Só é entregue se aprovado; reprovado = registrado e não entregue. Cada exportação guarda tamanho e SHA-256.
- Modelos reutilizáveis (cliente, conta, período, seções), histórico de exportações com status de verificação.
- Permissões: analista visualiza e exporta; admin/gestor gerenciam modelos. Tudo isolado por organização.
- Migração `0003`: `report_templates`, `report_exports`.

## Testes (reais)
Vitest 82/82 (13 novos): todos os 10 tipos × 3 formatos gerados e verificados (30 arquivos); verificador **reprova** arquivos adulterados/truncados/de outro relatório; PDF de 130 campanhas (várias páginas); acentos/caracteres especiais; CSV com ausentes, injeção, aspas/vírgulas/quebras; narrativa sem causalidade; isolamento e modelos. E2E de relatórios no navegador (downloads reais, conferência independente com `pdfinfo`/`pdftotext`, 401 sem login, 404 entre organizações, mobile 390 px) ✔. Regressão E2E das etapas anteriores ✔, axe ✔ (19 telas), `npm audit` 0 (uuid do exceljs forçado via overrides).

## Limitações
- **Não testado com dados reais da Meta**; os números do PDF mostram dados simulados (marcados).
- XLSX não foi aberto no Excel/LibreOffice real (verificado por reabertura com a própria biblioteca).
- PDF usa Helvetica padrão (sem fonte Inter embutida); caracteres fora do Latin-1/WinAnsi são substituídos.
- Gráficos do PDF simples (linhas); sem gráficos de barras/pizza. Sem agendamento/envio por e-mail de relatórios (depende de SMTP).
- Arquivos não são armazenados (apenas metadados e SHA-256); baixar de novo regenera com os dados do momento.
- Previsão de gasto é projeção linear simples.
