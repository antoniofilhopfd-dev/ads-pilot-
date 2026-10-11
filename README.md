# AdsPilot

SaaS multiempresa para gestão, análise e relatórios de campanhas (Meta Ads primeiro): painel, campanhas, operações com confirmação e verificação, relatórios PDF/XLSX/CSV e **MCP próprio** para assistentes de IA.

> **Estado honesto:** tudo foi testado em **modo demonstração (dados simulados)**. A integração com a **Meta real não foi validada** e a escrita em campanhas reais está **bloqueada**. Não publicado. Veja `docs/RELATORIO-FINAL.md`.

## Desenvolvimento
Requisitos: Node 22+, MySQL/MariaDB.
```bash
cp .env.example .env          # DATABASE_URL, ENCRYPTION_KEY (veja o arquivo)
npm install
npm run db:migrate            # migrações versionadas (./drizzle)
npm run dev                   # http://localhost:3000
npm test                      # 100+ testes (usam o banco *_test, recriado a cada execução)
npm run build && npm start
npm run e2e                   # E2E com navegador (app em :3000)   | npm run a11y   (axe-core)
npm run test:backup           # backup → restauração → verificação   | npm run bench (desempenho)
```
Documentação: `docs/DEPLOY.md` (publicação/rollback), `docs/SEGURANCA.md`, `docs/RISCOS.md`, `docs/mcp.md` (ferramentas MCP), `docs/etapa-*/RELATORIO.md`.
