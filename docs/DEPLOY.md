# Publicação, operação e recuperação (AdsPilot)

> **Status:** NÃO publicado. A Hostinger (plano, Node persistente, MySQL, cron, HTTPS) não foi verificada. Este guia foi validado em ambiente local equivalente (Node 22, MariaDB 10.11, build de produção).

## 0. Requisitos
- **Node.js 22+** com processo **persistente** (Next.js `next start`). Hospedagem estática/PHP não serve.
- **MySQL 8 ou MariaDB 10.6+** (testado em MariaDB 10.11), `utf8mb4`.
- **HTTPS** obrigatório (cookie de sessão é `Secure` em produção; HSTS ligado).
- Um agendador (cron) para `npm run sync` e backups.
- Para PDF não é necessário Chromium (PDFKit puro).

## 1. Variáveis de ambiente (`.env`, nunca no git)
| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | `mysql://usuario:senha@host:3306/banco` |
| `APP_URL` | sim | `https://seu-dominio` (usado em OAuth, links e checagem de Origin do MCP) |
| `ENCRYPTION_KEY` | sim | 32 bytes em base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). **Faça backup em cofre separado do banco**; perdê-la invalida todos os tokens da Meta (exige reconectar). |
| `META_APP_ID`, `META_APP_SECRET` | para Meta real | sem eles só o modo demonstração existe |
| `META_GRAPH_VERSION` | não | padrão `v25.0` (conferir versão vigente) |
Provedor de e-mail (SMTP): **não implementado** → recuperação de senha não funciona em produção (ver bloqueios).

## 2. Primeira publicação
```bash
git clone <repo> && cd ads-pilot- && git checkout <tag/branch>
npm ci
cp .env.example .env && nano .env        # preencher
npm run db:migrate                        # migrações versionadas (./drizzle)
npm run build
npm start                                 # porta 3000 (use gerenciador de processos: pm2/painel Node da hospedagem)
curl -s https://seu-dominio/api/health    # esperado: {"status":"ok",...}
```
Proxy reverso/HTTPS: encaminhar `https://dominio → 127.0.0.1:3000` com `X-Forwarded-For`/`Host` preservados.

## 3. Rotinas agendadas
```cron
0 */6 * * *   cd /caminho/app && npm run sync          >> logs/sync.log 2>&1      # sincroniza contas selecionadas
30 3 * * *    cd /caminho/app && DB_NAME=... DB_USER=... DB_PASSWORD=... KEEP=14 bash scripts/backup.sh /caminho/backups
```
Copie os backups para **outro local** (fora do servidor). A sincronização é idempotente e se recupera de execuções interrompidas.

## 4. Atualização e ROLLBACK
1. **Backup antes de migrar:** `bash scripts/backup.sh` (guarde o arquivo `.sql.gz` + `.sha256`).
2. `git fetch && git checkout <nova-versão> && npm ci && npm run db:migrate && npm run build` e reinicie o processo.
3. Verifique `/api/health` e o checklist (seção 6).
4. **Rollback de código:** `git checkout <versão-anterior> && npm ci && npm run build` + reiniciar. As migrações são **só para frente**; se a migração nova alterou colunas usadas pela versão antiga, faça também o rollback do banco:
5. **Rollback de banco:** `bash scripts/restore.sh backup.sql.gz banco_novo_vazio` (cria banco novo; recusa sobrescrever e recusa arquivo adulterado) → aponte `DATABASE_URL` para ele → reinicie. Dados criados depois do backup serão perdidos: registre isso.
- Validado: `npm run test:backup` (backup → restauração → checksum por tabela → login e descriptografia de token no banco restaurado).

## 5. Recuperação de desastre (resumo)
Banco perdido → provisionar MySQL → `restore.sh` do último backup → restaurar `ENCRYPTION_KEY` → `npm run db:migrate` (no-op se já na versão) → `npm start` → conferir `/api/health` → rodar `npm run sync`. Se a `ENCRYPTION_KEY` foi perdida: reconectar a Meta de cada organização.

## 6. Checklist pós-publicação
- [ ] `/api/health` = ok (`database`, `encryptionKey`, `appUrlHttps` verdadeiros)
- [ ] HTTPS válido, cookie `ap_session` com Secure/HttpOnly/SameSite, cabeçalhos (HSTS, CSP parcial) presentes
- [ ] Cadastro, login, logout e **recuperação de senha** (depende de SMTP) funcionam
- [ ] Meta: conectar conta de teste, sincronizar, comparar números com o Gerenciador de Anúncios
- [ ] Relatório PDF/XLSX/CSV baixado e conferido manualmente
- [ ] Cron de `sync` e de backup executou; backup restaurado em banco de teste
- [ ] Logs sem segredos; `.env` fora do git; permissões de arquivo restritas
- [ ] Token MCP criado/revogado; `POST /api/mcp` sem token = 401

## 7. Bloqueios conhecidos para lançamento comercial
1. Hospedagem/domínio/HTTPS não definidos nem validados.
2. **SMTP não implementado** (recuperação de senha, convites).
3. **App Meta + App Review + Business verificada** (sem isso só contas de quem administra o app).
4. **Validação com a Meta REAL** (leitura, OAuth e, depois, escrita) — nada disso foi testado fora de simulação.
5. Revisão jurídica de Termos/Privacidade (minutas) e definição de encarregado (LGPD).
