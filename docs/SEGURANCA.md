# Segurança — revisão (Etapa 07)

## Controles implementados e verificados
| Área | Controle | Verificação |
|---|---|---|
| Senhas | scrypt (N=16384) + sal; política ≥10 caracteres c/ letras e números; nunca em log/auditoria | testes de auth; auditoria sem segredos |
| Sessão | token aleatório 256 bits, só o SHA-256 no banco; cookie HttpOnly+Secure+SameSite=Lax; 14 dias; troca de senha derruba demais sessões | E2E segurança (flags), testes |
| Brute force | 10 tentativas/15 min por e-mail; resposta idêntica p/ usuário inexistente (custo igual) | teste + E2E |
| Reset de senha | token de uso único, 60 min, só hash; sem enumeração de contas | testes |
| Multi-tenancy | `organization_id` em todas as consultas; id alheio = "não encontrado" | matriz de 22 ataques A→B + testes por módulo + E2E |
| Autorização | papéis no servidor (matriz de permissões); UI apenas reflete | testes por papel |
| Segredos Meta | AES-256-GCM em repouso; só descriptografado no servidor no uso; nunca em log/auditoria/MCP | testes; restauração com/sem chave |
| Escrita em campanhas | preparar→confirmar→executar 1×→verificar; revalida estado; idempotência; erro ambíguo não repete | testes + E2E |
| MCP | token hash, escopos, revogação imediata, limites, Origin, auditoria, código humano p/ escrita | 15 testes + E2E HTTP |
| Conteúdo de terceiros | nomes de campanhas tratados como dado (controle removido, aviso); React escapa HTML | teste + E2E XSS |
| Injeção | Drizzle parametrizado; sem SQL cru com entrada de usuário; CSV com neutralização de fórmulas | testes |
| CSRF | Server Actions (verificação de Origin do Next); replay com Origin falso recusado; OAuth `state` | E2E segurança |
| Cabeçalhos | X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS (prod), CSP parcial | E2E segurança |
| Dependências | `npm audit --omit=dev` = 0; dev: 4 moderadas em `drizzle-kit`/esbuild (só desenvolvimento) | audit |
| Segredos no repositório | varredura do histórico git: nenhum token/chave | grep histórico |

## Lacunas conhecidas (não esconder)
- **CSP sem `script-src`** (o Next injeta scripts inline); endurecer com nonce é trabalho futuro.
- Limitadores de frequência **em memória** (reiniciam com o processo; 1 instância).
- Sem 2FA, sem verificação de e-mail, sem política de expiração de senha.
- `email_outbox` guarda o link de reset em texto no banco (até haver SMTP): quem lê o banco poderia redefinir senhas.
- Senha do banco de **desenvolvimento** (`adspilot_dev_pw`) aparece em `vitest.config.ts`/scripts de teste; é local e descartável — **nunca reutilizar** em produção.
- Sem WAF/proteção DDoS; sem monitoramento externo; auditoria só no banco (sem WORM).
- OAuth da Meta e escrita real **não testados** contra a Meta.
- Sem pentest independente. Esta revisão é automatizada + leitura de código pelo próprio autor.
