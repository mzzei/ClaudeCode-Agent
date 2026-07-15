# Handoff — trocar de máquina ou de conta

Checklist para trabalhar neste projeto (Meridian / WorldCupAgent) de forma segura em mais de um computador — ou de conta Claude.

## Antes de sair de uma máquina (terminar a sessão)

- [ ] `git status` — não deixar nada editado sem commitar
- [ ] `git add` + `git commit` de tudo que quer manter
- [ ] `git push origin main`
- [ ] Confirmar: `git status -sb` mostra `main...origin/main` sem "ahead"/"behind"

## Ao chegar numa máquina (começar a sessão)

- [ ] `git fetch origin`
- [ ] `git status -sb` — checar se está atrás do remoto
- [ ] Se estiver atrás e sem edições locais: `git pull origin main`
- [ ] Se a máquina estiver muito desatualizada e **sem nada local para preservar**:
      `git fetch origin && git reset --hard origin/main` (descarta tudo local, alinha 100% com o GitHub)
- [ ] Se houver dúvida sobre algo local não commitado: rodar `git status` e `git diff` antes de decidir — nunca `reset --hard` sem conferir

## Regra de ouro

Nunca deixar trabalho "pendurado" (editado mas não commitado/enviado) numa máquina antes de ir pra outra. Isso é o que causa divergência e conflito depois.

## Trocando de CONTA Claude (não só de máquina)

O código vive 100% no GitHub — clonar o repo já traz tudo isso. O que **não** viaja com o `git clone` é a memória do Claude Code (decisões, lições, regras de comportamento), que fica fora do repositório, em:

```
~/.claude/projects/<pasta-do-projeto>/memory/
```

- [ ] Copiar essa pasta `memory/` (contém `MEMORY.md` + os arquivos de memória individuais) para o caminho equivalente na conta/máquina nova
- [ ] Clonar o repo para um caminho de pasta igual ou parecido ao original — o Claude Code identifica o projeto pelo caminho da pasta de trabalho, então isso ajuda a memória "bater" no lugar certo
- [ ] Se não copiar a memória, recontar ao menos as regras de comportamento fixas ao novo Claude logo na primeira mensagem — a principal delas: **nunca rodar uma análise real no preview (botão "Analisar") sem pedir autorização antes, pois gasta créditos da chave Anthropic do usuário.** Verificação por `node --check`/testes unitários e por `renderResults(dados, {save:false})` injetado no navegador é livre (não chama a API) e não precisa de autorização.
- [ ] Ao chegar na conta nova, pedir um resumo de handoff completo (este arquivo + `git log` + confirmação de que está sincronizado com `origin/main`) antes de continuar o trabalho

## Referência rápida do projeto

- Repo: `mzzei/ClaudeCode-Agent` · branch `main`
- App inteiro em `index.html` (single file, sem frameworks)
- Rodar local: `Iniciar WorldCup Agent.bat` (sobe `serve.js` via Node na porta 3456; cai em `serve.ps1` se node faltar) — não abrir `index.html` direto via `file://`
- PWA: `manifest.json` + `sw.js` (network-first) + ícones em `assets/`
- Produto se chama **Meridian** (nome da pasta/repo ficou o antigo, não renomeado)

Lições e decisões técnicas importantes (allowed_domains, grounding temporal, performance/rendering por software) ficam registradas na memória do Claude Code, não neste arquivo — se estiver retomando numa máquina/conta nova, peça um resumo de handoff completo no início da conversa.
