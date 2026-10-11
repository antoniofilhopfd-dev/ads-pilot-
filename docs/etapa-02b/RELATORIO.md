# Pendências internas (sem dependência externa) — conta, LGPD, colunas, acessibilidade

**Status: concluído e testado.**

- **Minha conta** (`/app/conta`): alterar nome; alterar senha (exige a atual, mantém a sessão atual, derruba as demais); baixar meus dados (JSON sem hash/tokens); excluir conta (exige senha; bloqueia se for o único admin de organização com outros membros; apaga organizações só dele; auditoria mantida anonimizada).
- **Minutas** de Termos e Privacidade (`/termos`, `/privacidade`), marcadas como rascunho — **não são aconselhamento jurídico**.
- **Seletor de colunas** em Campanhas (estado na URL).
- **Acessibilidade:** auditoria automática axe-core (WCAG A/AA) em 14 telas + checagem de IDs duplicados. Achou: contraste insuficiente do texto secundário (paleta original `#69738A` = 4,4:1) → escurecido para `#5A6478`; verde/vermelho de texto ajustados (`#0F7A56`, `#C53030`); IDs duplicados em "Minha conta" (corrigido). **Desvio da paleta original, justificado por contraste.** Não substitui teste manual com leitor de tela.

Testes: 54 Vitest ✔, E2E conta ✔, E2E Etapas 02/03 (regressão) ✔, axe ✔.

Limitações: sem verificação de e-mail, 2FA ou exclusão de organização por admin; prazo de retenção e encarregado (DPO) a definir; minutas jurídicas pendentes de revisão profissional.
