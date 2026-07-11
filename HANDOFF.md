# Handoff — trocar de máquina

Checklist para trabalhar neste projeto (Meridian / WorldCupAgent) de forma segura em mais de um computador.

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

## Referência rápida do projeto

- Repo: `mzzei/ClaudeCode-Agent` · branch `main`
- App inteiro em `index.html` (single file, sem frameworks)
- Rodar local: `Iniciar WorldCup Agent.bat` (sobe `serve.js` via Node na porta 3456; cai em `serve.ps1` se node faltar) — não abrir `index.html` direto via `file://`
- PWA: `manifest.json` + `sw.js` (network-first) + ícones em `assets/`
- Produto se chama **Meridian** (nome da pasta/repo ficou o antigo, não renomeado)

Lições e decisões técnicas importantes (allowed_domains, grounding temporal, performance/rendering por software) ficam registradas na memória do Claude Code, não neste arquivo — se estiver retomando numa máquina/conta nova, peça um resumo de handoff completo no início da conversa.
