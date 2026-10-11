# AdsPilot

SaaS multiempresa para gestão, análise e otimização de campanhas (Meta Ads primeiro). Plano completo em `docs/`.

## Desenvolvimento
Requisitos: Node 22+, MySQL/MariaDB.

```bash
cp .env.example .env          # ajuste DATABASE_URL
npm install
npm run db:migrate            # aplica migrações versionadas (./drizzle)
npm run dev                   # http://localhost:3000
npm test                      # testes de integração (usa o banco *_test, recriado a cada execução)
npm run build && npm start
node --env-file=.env --import tsx scripts/e2e.ts   # E2E com navegador (app em :3000)
```

Estado: Etapa 02/07 (fundação). Ainda **sem** integração com a Meta.
