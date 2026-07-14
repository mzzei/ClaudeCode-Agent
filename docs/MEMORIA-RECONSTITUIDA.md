# Meridian — memória reconstituída (Grok, 2026-07-14)

Documento gerado a partir de: código (`index.html` ~407 KB), git history, `HANDOFF.md`,
`docs/`, `worker/`, `supabase/`, e mineração das sessões Claude Code
(`f2f081eb…` / `f2fecec8…`, ~23 MB cada).  
**Não** é a memória nativa do Claude Code (essa não foi exportada em arquivos `MEMORY.md`);
é a melhor reconstituição possível a partir de evidências no disco.

---

## 1. O que é o produto

| Campo | Valor |
|--------|--------|
| Nome de produto | **Meridian** (pasta/repo ainda se chamam “Agente Copa 2026” / `ClaudeCode-Agent`) |
| Repo | `https://github.com/mzzei/ClaudeCode-Agent` · branch `main` |
| Path local | `C:\Users\Gabriel\.claude\projects\Agente Copa 2026` |
| Forma | SPA **single-file** (`index.html`) + PWA (`manifest.json`, `sw.js`) + assets |
| Deploy | GitHub Pages (`mzzei.github.io/ClaudeCode-Agent`) + rodar local |
| Local | `Iniciar WorldCup Agent.bat` → `serve.js` (Node, porta **3456**, `autoPort`) · fallback `serve.ps1` |
| Modelo de negócio implícito | **BYOK** (usuário traz chave Anthropic) · conta (Supabase) é identidade, **não** a chave |

### Propósito (nas palavras do usuário)

Auxiliar em **análises precisas** de partidas da Copa 2026 para **melhor aproveitamento em tickets de aposta**.  
Não basear a análise *necessariamente* em odds de casas; incluir sugestões de eventos comuns;
fundar em **notícias/fatos reais** + **modelagem estatística/probabilística** (Poisson, lambdas, xG).

### UX desejada (histórico de pedidos)

- Interface **intimista, minimalista, aconchegante** (evoluiu de paleta terra cotta → **verdant/glass**).
- Chips de exemplos = combinações de **eventos reais/prováveis** (não confrontos fantasiosos).
- **Consciência temporal**: jogos de hoje + 2 dias; fase da competição pesa na interpretação.
- Picker de **modelo** + **esforço** + contador de tokens estilo Claude (thinking ao vivo).
- Diálogo de chat com ações parecidas às do Claude (copiar, etc.).
- Prompt caching para custo.
- Abas de resultado: Resumo, Tática, Desempenho individual, Cartões & Faltas, Escalação (mapa).

---

## 2. Arquitetura do “cérebro” (pipeline no browser)

Tudo roda **no navegador** com a chave do usuário (ou via Worker proxy).  
**Não depende** de Cloudflare KV, Supabase ou cron para analisar.

```
Usuário (partida / chat)
        │
        ▼
┌───────────────────┐
│ Coleta (Fase 1)   │  gatherFacts() · Haiku (ou Sonnet se dynSearch)
│ + APIs det.       │  cascata AF / Football-Data / ESPN + TheSportsDB paralelo
│ + web_search      │  structured outputs (json_schema) com auto-cura em 400
└─────────┬─────────┘
          │ portão de completude (código, quase grátis)
          │ + portão anti-alucinação de nomes (verifyLineupNames / evidência de busca)
          ▼
┌───────────────────┐
│ Análise (Fase 2)  │  runAnalysis() · Sonnet 4.6 / Opus 4.8
│                   │  SEM structured outputs (grammar too large — testado 07/2026)
│                   │  prompt-contrato + parseAnalysisJson / repairJson + retry
│                   │  Poisson no cliente (calcPoisson)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Verificador (F3)  │  verifyAnalysis() · Haiku · NÃO reescreve
│                   │  anota ressalvas + pode rebaixar confiança · _applyAudit()
└─────────┬─────────┘
          ▼
    renderResults() · abas · histórico local · export HTML
```

### Funções-chave em `index.html`

| Função | Papel |
|--------|--------|
| `gatherFacts` | Coletor Fase 1 + web_search + FACTS_SCHEMA |
| `runAnalysis` | Orquestra pipeline de análise |
| `verifyAnalysis` / `_applyAudit` | Auditor pós-análise |
| `renderResults` | UI das abas / cards |
| `_pitchTeam` / `_lineupRowsFromText` | Mapa de escalação (deriva linhas no render) |
| `verifyLineupNames` | Portão determinístico anti-nome inventado |
| `loadSchedule` / `fetchScheduleFromApi` | Agenda (Haiku + ESPN/AF/FD) |
| `streamOnce` | SSE streaming monolítico (Anthropic) |
| `calcPoisson` / `poissonPMF` | Mercados de placar/gols |
| `fetchMemoryContext` | Contexto de “memória” de chat (local) |
| `saveAnalysis` / `renderRecentAnalyses` | Histórico (localStorage / por origem) |

### Modelos

- `claude-haiku-4-5-20251001` — coleta, agenda, verificador  
- `claude-sonnet-4-6` — análise padrão; coleta se **filtragem dinâmica** (`web_search_20260209`)  
- `claude-opus-4-8` — análise alta qualidade (picker)

---

## 3. Fontes de dados e regras duras (lições do projeto)

### Cascata / fontes

1. **API-Football** (via Worker se CORS; chave em settings ou secret do Worker) — técnico, escalação, fixtures, standings; **throttled** (fila) para evitar rate limit.  
2. **Football-Data** (quando disponível).  
3. **ESPN** — fallback importante; se AF falha com chave quebrada, **ESPN é melhor que “nada”**.  
4. **TheSportsDB** — em paralelo; reforço de robustez.  
5. **web_search** (Sofascore, FotMob, imprensa) — stats de jogador, escalações prováveis, notícias.

Widgets “Dados ao vivo” (API-Sports) foram **adicionados e depois removidos** (plano Free limitado / UX).

### Regras de grounding (não negociar sem reler o código)

- **SOURCE_RULE / GROUNDING_RULE**: fatos voláteis só dos dados coletados; não inventar técnico/escalação de memória.  
- **RESOLVER ANTES DE DECLARAR**: no chat, se o usuário pede fato checável, **buscar** antes de dizer “não tenho”.  
- **xG**: estimar a partir de proxies é **função do analista**, não lacuna; rotular “estimado” vs “medido”.  
- **allowed_domains**: histórico de problemas — foi **removido** com nota explícita no código (não reintroduzir de leve).  
- **Tickets**: disciplina anti-alucinação; confiança alta/média/baixa com critérios no prompt.  
- **Nomes de jogadores**: proibido inventar; portão cruza com evidência textual da busca.  
- **Structured outputs**:  
  - Fase 1: **sim** (com auto-cura 400).  
  - Fase 2: **não** — schema estoura grammar da API (testado ao vivo 07/2026).  
- **DynSearch**: Sonnet + `web_search_20260209` opt-in; se 400, cai para Haiku + `web_search_20250305` **sem** sacrificar dynSearch por engano de SO.

### UI / performance

- Glassmorphism pesado (`backdrop-filter` 11–48px) — jank em software renderer; existe `_isSoftwareRenderer`.  
- Pendência documentada em sessão: isolar blur de camadas com `overflow-y:auto` (scroll + blur no mesmo elemento).  
- Barras de probabilidade: animar `transform`, não `width`.  
- Export HTML: concatenar **todos** os `<style>` (extensões do Edge injetavam style na frente).  
- PWA network-first (`sw.js`).

---

## 4. Infra opcional (não é o cérebro)

### Cloudflare Worker (`worker/`)

- Proxy CORS: `/af/*` → API-Football · `/v1/*` → Anthropic (injeta secrets).  
- **Sintetizador / Resumo do Dia** (cron + KV): implementado e depois **rebaixado/removido como prioridade** — cosmético, não inteligência. Decisão do usuário: remover do caminho principal (`37365d9`).  
- Futuro: cron de **scoring** do Backtester (primeiro job “de verdade”).

### Supabase (`supabase/`) — Fase 1 Contas

- Schema pronto: `profiles` (plan free/pro) + `predictions` + RLS.  
- **Fiação do cliente no app ainda pendente** (precisa Project URL + anon key do usuário).  
- Princípio: login opt-in; app funciona sem conta; conta = identidade + sync + base de cobrança futura.

### Backtester (`docs/backtester-design.md`) — próximo passo que “move a agulha”

- Métricas: hit rate por confiança, calibração 1X2, Brier (v2), hit rate por mercado.  
- Scoring = **código**, não IA.  
- Ordem: fiação Supabase → INSERT em `renderResults` → cron Worker → tela “Meu Desempenho”.  
- **Sentinela** (push / alerta pré-jogo) também depende de identidade — não priorizado ainda.

---

## 5. Decisões de produto / arquitetura já fechadas

| Tema | Decisão |
|------|---------|
| Advisor/executor multi-agente | **Não** se aplica bem — análise *é* o trabalho de alta inteligência; picker + caching bastam |
| Verificador | Haiku **audita**, não reescreve; fusão determinística |
| Sintetizador | Cosmético; não bloquear ship |
| Conta vs chave | BYOK; conta ≠ chave API |
| Histórico antigo pré-`saveAnalysis` | Irrecuperável; refazer análise |
| Histórico | Preso a navegador + origem (localhost ≠ Pages) |
| API key | sessionStorage (não disco permanente) na evolução da revisão |
| Advisor de custo | Preferir Haiku na coleta; Sonnet/Opus na análise |

---

## 6. Evolução recente (git, jul/2026) — o que estava quente

Foco dos últimos commits: **abas Escalação + Cartões**, mapa de campo, anti-alucinação de nomes,
parser de formação (`e`/`y`/`&`), `_pitchTeam` rederiva linhas no render (análises antigas com `rows:null`),
agenda mata-mata ESPN, servidor local robusto (`autoPort`).

**Último ponto da sessão Claude (2026-07-14):**  
commit `36af048` — fix de render do mapa de escalação; usuário testando Inglaterra × Argentina no preview;
pedido “não renderizou” → fix e push.

---

## 7. O que ainda está aberto (backlog honesto)

1. **Fiação Supabase no cliente** (aguardando chaves do projeto).  
2. **Backtester** ponta a ponta (design pronto).  
3. **Sentinela** (push / timing).  
4. Possível isolamento de `backdrop-filter` vs scroll (performance).  
5. Sanitização/esc já existe (`esc()`); manter disciplina em novos `innerHTML`.  
6. README do repo ainda mínimo (“ClaudeCode-Agent”).  
7. Memória nativa do Claude Code **não** estava em arquivos exportáveis — este doc a substitui.

---

## 8. Como esta memória foi reconstruída (método)

1. **Artefatos de projeto** — `HANDOFF.md`, `docs/*`, `worker/*`, `supabase/*`, git log/mensagens.  
2. **Código vivo** — prompts embutidos, funções, schemas, comentários de “testado ao vivo”.  
3. **Sessões Claude** — `session_reader.py` + mineração do JSONL (`~/.claude/projects/C--Users-Gabriel--claude-projects-Agente-Copa-2026/*.jsonl`): mensagens do usuário, snippets de decisão, tools usados.  
4. **O que NÃO existia** — pasta `memory/` / `MEMORY.md` do Claude; compact summaries vazios no reader; 406 record types desconhecidos ignorados com segurança.

### Limitações

- Compactação de contexto do Claude pode ter **apagado** turns intermediários.  
- Subagentes (~10 JSONL) têm contexto tático pontual, não visão de produto.  
- Tool outputs antigos são **stale** — sempre revalidar no código/git antes de confiar.

---

## 9. Como manter a memória daqui pra frente (Grok + Claude)

| Ação | Efeito |
|------|--------|
| Atualizar este arquivo após decisões grandes | Memória portátil entre agentes |
| Commitar com mensagens claras (já é o padrão) | Timeline legível |
| Manter `HANDOFF.md` para troca de máquina | Operacional |
| Evitar decisões só no chat do Claude sem gravar no repo | É exatamente o buraco que este doc tapa |

**Sessões Claude relevantes:**  
- `f2f081eb-e137-4de0-8175-11e949205edd` — “World Cup 2026” (principal)  
- `f2fecec8-a849-4b64-969e-80cd14239a4a` — “Agent - World Cup 2026” (espelho/quase idêntico em tamanho)
