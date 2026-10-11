# Etapa 02/07 — Fundação, arquitetura e segurança — **concluída**

## Implementado
- **Estados de erro/404/carregamento próprios:** `error.tsx`, `global-error.tsx`, `not-found.tsx` (raiz e dentro do app, mantendo menu/cabeçalho), esqueleto `loading.tsx` nas telas que nunca respondem 404, e indicador "Carregando…" no menu durante navegações lentas. Descoberta no caminho: um `loading.tsx` global faria o status HTTP de um 404 virar **200** (efeito do streaming do Next); por isso o desenho acima — o 404 real é preservado e testado.
- **CSP com nonce** (`src/proxy.ts`): `script-src 'self' 'nonce-…' 'strict-dynamic'`, sem `unsafe-inline` em scripts; nonce novo a cada requisição; `X-Request-Id` em todas as páginas. Resolve a lacuna "CSP sem script-src" do relatório de segurança. Provado no navegador: handler inline (`onerror`) e `<script>` inline sem nonce **são bloqueados**; 10 telas autenticadas navegadas **sem nenhuma violação** de CSP.
- **Log estruturado de erros** (`instrumentation.ts`): erro não tratado → linha JSON sem segredos com `digest` (o mesmo código mostrado ao usuário), rota e método.
- **Jobs:** serviço único `runScheduledSync`, usado por `npm run sync` e por `POST /api/cron/sync` (cabeçalho `x-cron-secret`, comparação em tempo constante, **desativada sem segredo ou com segredo < 24 caracteres**). Padrão aproveitado do AdFlow (matriz item 11).
- **ESLint** (Next + TypeScript) configurado e limpo (0 erros, 0 avisos). Para isso o projeto passou do TypeScript 7 para o **6.0** (typescript-eslint ainda não suporta o 7); `tsc`, build e testes seguem verdes. Defeitos reais achados e corrigidos: chamadas impuras (`Date.now`) durante a renderização.
- **Acessibilidade:** link "Pular para o conteúdo" (primeiro Tab), `main` focável.
- Revisões: isolamento multiempresa (matriz de 22 ataques mantida), proteção de credenciais (logs com mascaramento, tokens criptografados), validação de entradas (Zod no servidor), banco (22 tabelas com índices e FKs; migrações versionadas).

## Testes (reais)
- Vitest **121/121** (2 novos: cron). E2E **fundação** (novo, 10 verificações) ✔ + regressão de **9 suítes E2E** ✔ + axe (19 telas) ✔ + ESLint ✔ + `tsc` ✔ + `npm audit` produção 0.

## Limitações
- Limitadores de frequência continuam em memória; `email_outbox` guarda link de reset até haver SMTP.
- O cron roda as organizações em sequência (suficiente no volume atual; paralelizar se crescer).
- `ENABLE_TEST_ROUTES` (rota `/app/diagnostico-erro`) deve ficar **desligada** em produção (retorna 404 sem a variável).
