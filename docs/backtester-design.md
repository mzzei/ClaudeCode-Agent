# Meridian · Backtester — design

Este é o papel que **realmente move a agulha**: transforma o Meridian de "opinador"
em instrumento medível — "tickets de alta confiança acertaram 71% neste torneio"
é uma frase que só existe se este papel existir. Depende da Fase 1 (contas/Supabase)
já desenhada em `supabase/`; este documento é o próximo passo depois que a fiação
do cliente Supabase estiver ligada.

Não é código ainda — é o desenho, para implementar quando a Fase 1 estiver de pé.

---

## 1. O que ele mede (e por que cada métrica importa)

| Métrica | Pergunta que responde | Por quê importa |
|---|---|---|
| **Hit rate por confiança** | Tickets "alta confiança" acertam mais que "média"? | Se não acertam mais, o rótulo de confiança está mentindo — é o teste mais básico de honestidade do agente. |
| **Calibração do 1X2** | Quando o agente diz "60% de vitória", isso acontece ~60% das vezes? | Diferencia "acertar o favorito" (fácil) de "saber o tamanho certo da chance" (difícil e é o que interessa pra apostar). |
| **Brier score** (opcional, fase 2 do Backtester) | Nota única de qualidade probabilística, comparável entre fases do torneio/modelos. | Permite comparar Sonnet vs. Opus, ou "antes/depois do Verificador", com um número. |
| **Hit rate por mercado** | Tickets de "resultado" acertam mais que os de "over/under" ou "jogador"? | Aponta onde o agente é mais/menos confiável — vira instrução pro prompt. |

O princípio geral: **cada métrica deve ser acionável** — se um número vier ruim, deve
apontar pra uma mudança concreta (ex.: recalibrar o texto que define "alta confiança"
no prompt da Fase 2/Verificador).

---

## 2. Fluxo de dados (do registro ao resultado)

```
① Análise renderiza          ② Resultado real existe        ③ Scoring (código, não IA)     ④ Agregação
   (usuário logado)              (jogo terminou)                 casa previsão × resultado       (tela "Meu Desempenho")
        │                              │                                │                              │
        ▼                              ▼                                ▼                              ▼
  INSERT predictions          fonte: TheSportsDB/ESPN            UPDATE predictions              SELECT com GROUP BY
  (1X2, confiança,            (já integradas no app/worker,       SET result_home, outcome,       confidence/mercado
   lambdas, tickets)          zero fonte nova)                    tickets_result, scored_at
```

### ① Gravar a previsão (no app, ponto de extensão já existe)
Em `renderResults(d, opts)` (onde `_pstats` já é anexado hoje), se o usuário estiver
logado: `INSERT` em `predictions` com `home`, `away`, `match_date`, `prob_home/draw/away`,
`confidence`, `lambda_home/away`, `tickets` (o array já existe em `d.sugestoes_ticket`),
`model`, `local_hid` (link com o histórico local). **Não é uma chamada de IA** — é
gravar o que a análise já produziu. Custo: zero tokens.

### ② Saber quando o jogo terminou
Reaproveita fonte que **já existe no projeto**: o app já consulta a ESPN e o
TheSportsDB (`eventspastleague.php?id=4429`) para a coleta de fatos. Nenhuma fonte
nova — é o mesmo dado, olhado com outro propósito.

### ③ Scoring — a peça nova, e por que é um JOB, não um prompt
Um **cron no Worker** (novo — o Worker hoje só faz proxy sob demanda, este é o
primeiro job agendado do projeto) roda 1x/dia:
1. Busca `predictions` com `scored_at is null` e `match_date <= hoje` (índice já existe
   no schema: `predictions_pending_idx`).
2. Casa por nome dos times + data com o resultado real (TheSportsDB/ESPN).
3. Calcula `outcome` ('home'/'draw'/'away') comparando `result_home` × `result_away`.
4. Para cada ticket em `tickets`, avalia se o texto da aposta bateu com o resultado
   (regras determinísticas simples primeiro: "vitória de X" / "over/under N.5" /
   "ambas marcam" são fáceis de checar por código; tickets em linguagem mais livre
   entram na v2, avaliados por Haiku com o resultado real como entrada — nunca antes).
5. `UPDATE` gravando `result_home`, `result_away`, `outcome`, `tickets_result`, `scored_at`.

**Por que isso é código e não um papel de IA:** resultado de futebol é um fato
objetivo (3-1, aconteceu ou não aconteceu) — pedir a um modelo para "avaliar se
acertou" seria adicionar ruído probabilístico a algo que é aritmética. IA só entra
(v2) para os poucos tickets em linguagem ambígua que o código não consegue parsear.

### ④ Agregação — a tela "Meu Desempenho"
Consulta simples (client-side, via Supabase JS, protegida por RLS — cada usuário só
agrega os próprios dados):
```sql
select confidence, count(*) filter (where outcome = case
    when prob_home > prob_draw and prob_home > prob_away then 'home'
    when prob_away > prob_home and prob_away > prob_draw then 'away'
    else 'draw' end) as acertos,
  count(*) as total
from predictions
where user_id = auth.uid() and scored_at is not null
group by confidence;
```
Renderiza como cards simples: "Alta confiança: 12/17 (71%)" · "Média: 8/15 (53%)"
— reaproveitando o CSS de `.pstat`/`.tiles` que já existe no app.

---

## 3. O que NÃO fazer (riscos já identificados)

- **Não avaliar tickets ambíguos com IA na v1.** Só os determinísticos (resultado,
  over/under, BTTS). Reduz o escopo do primeiro corte e evita "calibração medida
  por um medidor não-calibrado".
- **Não expor calibração agregada entre usuários ainda.** É tentador ("Meridian
  acerta 68% globalmente!") mas requer a função `SECURITY DEFINER` já anotada como
  FUTURO no `schema.sql` — fazer isso cedo demais, sem cuidado de anonimização,
  é risco de privacidade desnecessário para o primeiro corte.
- **Não travar a UI em amostra pequena.** Com poucos jogos julgados, qualquer
  percentual é ruído estatístico — mostrar "71%" com N=3 é enganoso. A tela deve
  esconder/avisar quando `total < 10` por bucket (ex.: "ainda poucos dados").
- **Não pontuar times que empatam por narrativa.** `outcome` é sempre derivado do
  placar real, nunca de texto livre — evita o mesmo tipo de alucinação que o
  Verificador já existe para pegar na análise em si.

---

## 4. Ordem de implementação sugerida (quando chegar a hora)

1. Fiação do cliente Supabase no app (login) — pré-requisito, já combinado.
2. `INSERT` em `predictions` no `renderResults` (baixo risco, só gravação).
3. Job de scoring no Worker (primeiro cron do projeto — Cron Triggers do Cloudflare).
4. Tela "Meu Desempenho" (leitura + agregação, reaproveita CSS existente).
5. (v2, opcional) Scoring de tickets ambíguos via Haiku; Brier score; comparação
   entre modelos/fases do prompt.

Cada item acima é testável isoladamente e nenhum quebra o app atual — mesmo padrão
"aditivo, opt-in, degrada em silêncio" usado nas contas (Fase 1).
