# Dependências externas e bloqueios (atualizado em 11/10/2026)

| Item | Necessário para | Estado | O que preciso de você |
|---|---|---|---|
| **App Meta** (App ID/Secret), Business verificada, App Review, **conta de anúncios de teste** | leitura real, OAuth, escrita real, pixels, públicos reais, prévia oficial, validação de métricas | **bloqueado** | criar o app e conceder as permissões (`ads_read`; depois `ads_management`, `business_management` se necessário); ver `docs/DEPLOY.md` §1 |
| **Hospedagem + domínio + HTTPS** (Node persistente, MySQL, cron) | publicar | **bloqueado** | informar plano/acesso; custo a aprovar se for VPS |
| **Provedor de e-mail (SMTP)** | recuperação de senha, convites, relatórios por e-mail | **bloqueado** (custo) | escolher o provedor |
| **Evolution API** (instância pareada) + número | WhatsApp real | **bloqueado** | URL, chave, instância, número; infraestrutura (Docker) |
| **Chave de modelo de linguagem** (ex.: API da Anthropic) | diagnósticos de IA generativos | **bloqueado** (custo/credencial) | autorizar o uso e fornecer a chave; **hoje: análise por regras** |
| Revisão jurídica (Termos/Privacidade/LGPD) | lançamento | pendente | profissional especializado |
| Teste manual (leitor de tela, aparelhos reais) | aceite de acessibilidade | pendente | — |

Tudo o mais é **independente** e será executado e testado localmente.
