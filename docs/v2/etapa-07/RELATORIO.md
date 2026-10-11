# AdsPilot v2 — Etapa 07/07: Verificação final e preparo para produção

Resultados **reais** desta rodada (modo DEMONSTRAÇÃO; nada contra a Meta real):

| Verificação | Resultado |
|---|---|
| TypeScript / ESLint | 0 erros / 0 problemas |
| Vitest | **190 testes**, 20 arquivos, todos passando |
| E2E em navegador (13 suítes) | e2e, conta, meta, ops, reports, mcp, security, acesso, logo, fundação, gestão, inteligência, canais — **todas OK**, sem violações de CSP |
| axe-core (WCAG A/AA) | 0 violações automáticas em todas as telas (2 defeitos reais achados e corrigidos: menu lateral estourando a altura; links sem sublinhado em texto) |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Varredura de segredos | nenhum segredo no repositório; `.env` não versionado |
| Backup/restauração | OK: 43 tabelas, 29.434 linhas, checksum idêntico; token só abre com a chave original |
| Desempenho (300 campanhas × 90 dias) | painel 30 d ≈ 148 ms, 90 d ≈ 308 ms; lista ≈ 51 ms; relatório ≈ 214 ms; XLSX ≈ 238 ms; PDF ≈ 1,2 s |
| Prints | 33 telas reais em `docs/v2/etapa-07/prints/` (desktop + celular) |

## Estado por etapa
01 Auditoria ✔ · 02 Fundação ✔ · 03 Gestão operacional ✔ · 04 Inteligência ✔ · 05 Preparo de integração ✔ (testado com simulações) · **06 Ativação real ⛔ bloqueada por credenciais** · 07 Verificação ✔.

## O que NÃO está validado (honestidade)
- Nenhuma chamada à Meta real, ao WhatsApp/Evolution real, a SMTP ou a LLM foi feita. Ver `docs/v2/etapa-05/CREDENCIAIS.md`.
- Escrita na Meta só existe em simulação; envio de rascunho à Meta está bloqueado por design.
- Acessibilidade: falta teste manual com leitor de tela. Conformidade LGPD: funcionalidades existem, mas não há parecer jurídico.
- Diagnósticos usam regras simples em janelas de 7 dias; hipóteses não são fatos.
- Métricas por conjunto/anúncio ainda não são sincronizadas (somente campanha).

## Checklist de produção (antes de publicar)
1. Servidor Node 22+, MySQL/MariaDB 10.11+, HTTPS e domínio (pendente: Hostinger).
2. `.env` de produção: `DATABASE_URL`, `APP_URL` (https), `ENCRYPTION_KEY` (cofre separado), `CRON_SECRET` (≥ 24 caracteres), e — quando houver — `META_APP_ID/SECRET`, `EVOLUTION_*`. Não definir `ENABLE_TEST_ROUTES`.
3. `npm ci && npm run db:migrate && npm run build && npm start`.
4. Cron a cada 6–12 h: `POST /api/cron/sync` com `x-cron-secret` (sincroniza, renova tokens, avalia alertas e despacha a fila).
5. Backup diário (`scripts/backup.sh`) e teste de restauração periódico.
6. Meta: criar app, solicitar App Review/verificação da empresa, validar sync com conta de teste (Etapa 06).
7. SMTP para recuperação de senha e convites.
8. Revisão jurídica de Termos e Privacidade.
