# Etapa 02/07 — Fundação

**Status: concluído e testado (aguardando aprovação).** Escopo: estrutura, design system, autenticação, organizações, clientes, permissões, banco, migrações, logs e testes de isolamento. **Sem Meta, sem relatórios, sem MCP.**

## Funcionalidades implementadas
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4, tema com a paleta e Inter (400–700, numerais tabulares).
- Cadastro (cria usuário + organização + perfil Administrador numa transação), login, logout, recuperação e redefinição de senha.
- Sessões por cookie httpOnly/SameSite=Lax (Secure em produção); no banco só o hash SHA-256 do token. Senhas com scrypt.
- Multi-organização: usuário pode pertencer a várias; organização ativa revalidada no servidor a cada requisição.
- Perfis Administrador / Gestor de anúncios / Analista (leitura) com matriz de permissões aplicada nos serviços (servidor).
- Clientes (CRUD), equipe (adicionar usuário existente, trocar perfil, remover; bloqueia remover/rebaixar o último admin), configurações (renomear organização), histórico de atividades.
- Auditoria (usuário, organização, cliente, objeto, operação, antes/depois, resultado, requestId), com remoção automática de campos sensíveis.
- Logs estruturados JSON com mascaramento de campos sensíveis; limite de tentativas de login (10/15 min) e de recuperação (5/h).
- Cabeçalhos de segurança (X-Frame-Options, nosniff, Referrer-Policy).
- Painel mostra estado vazio honesto: "nenhuma conta de anúncios conectada" (sem dados fictícios).

## Arquivos
Criados: `package.json`, configs (`tsconfig`, `next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`, `postcss`), `.env.example`, `.gitignore`, `README.md`, `drizzle/0000_*.sql`, `src/db/*`, `src/lib/*` (crypto, logger, errors, rate-limit), `src/server/*` (permissions, context, audit, session, services/{auth,clients,organizations}), `src/components/*`, `src/app/**` (login, cadastro, recuperar/redefinir senha, /app/{painel,clientes,equipe,atividades,configuracoes}, actions), `tests/*`, `scripts/{migrate,e2e}.ts`, `docs/etapa-02/*`. Modificados: `README.md`.

## Banco de dados
Migração `0000`: `users`, `sessions`, `password_reset_tokens`, `organizations`, `memberships` (único org+usuário), `clients` (único org+nome), `audit_log` (índice org+data), `email_outbox` (**só desenvolvimento**). FKs com cascade. Ambiente: **MariaDB 10.11** local.

## Testes executados (resultados reais)
| Teste | Resultado |
|---|---|
| Vitest: 17 testes (autenticação, recuperação, força bruta, isolamento, permissões, auditoria) contra MariaDB real, banco recriado via migrações | **17/17 passaram** |
| `tsc --noEmit` | sem erros |
| `next build` (produção) | OK, 11 rotas |
| E2E Playwright (Chromium real, 10 verificações, build de produção) | **OK** — inclui org B não ver clientes da org A, analista sem botões de escrita, logout, recuperação de senha e ausência de rolagem horizontal em 390 px |
| `npm audit --omit=dev` | 0 vulnerabilidades. 4 moderadas só em `drizzle-kit` (ferramenta de dev); a correção sugerida seria *downgrade* para 0.18.1, não aplicada |

Bugs encontrados pelos próprios testes e corrigidos: (1) erro de chave duplicada do MySQL vinha encapsulado pelo Drizzle e viraria erro 500; (2) formulários eram limpos após erro de validação (perda do que o usuário digitou).

Isolamento verificado: leitura, edição e exclusão de cliente de outra org → "não encontrado"; listagem de membros/atividades isoladas; usuário não vira "ator" em org alheia; membro de 2 orgs só vê a org ativa.

## Limitações (não esconder)
- **Não há envio real de e-mail (SMTP).** O link de recuperação vai para `email_outbox`; em produção a recuperação **não funcionará** até definirmos um provedor (decisão de custo pendente).
- **Convites por e-mail não implementados**: o admin só adiciona quem já tem conta.
- Limitador de tentativas é em memória (vale para 1 processo Node).
- Formulários dependem de JavaScript. Não há CSP nem verificação explícita de CSRF além da proteção de Origin das Server Actions do Next.
- Sem: alterar a própria senha/e-mail logado, excluir conta/exportar dados (LGPD), criar 2ª organização após o cadastro, verificação de e-mail, 2FA.
- Tabelas ainda sem busca/ordenação/paginação; acessibilidade sem auditoria automatizada (apenas foco visível, rótulos e navegação por teclado básica).
- Testado em MariaDB 10.11; **versão/engine do banco da Hostinger ainda desconhecida**.
- Backup/restauração não testados (Etapa 07).

## Riscos e pendências
1. Plano Hostinger e domínio ainda não informados (necessário p/ confirmar Node persistente e banco).
2. App Meta / Business verificada / App Review: caminho crítico da Etapa 03 — iniciar agora.
3. Escolha de provedor de e-mail (SMTP) — custo a aprovar.
4. Dashboard rico (KPIs/gráficos do mockup aprovado) depende de dados reais (Etapa 03).

## Como validar
```bash
npm install && cp .env.example .env   # configure DATABASE_URL
npm run db:migrate && npm test
npm run build && npm start            # e depois: node --env-file=.env --import tsx scripts/e2e.ts
```
Manual: crie 2 contas em navegadores distintos, cadastre clientes em uma e confirme que a outra não os vê.

## Próxima etapa proposta
Etapa 03/07 — Meta e dados reais (OAuth, seleção de contas, sincronização, métricas, dashboard, central de saúde). Requer: app Meta + conta de teste, e decisão sobre SMTP/hospedagem.
