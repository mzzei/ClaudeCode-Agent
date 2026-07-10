# Meridian · Fase 1 — Contas (Supabase)

Fundação de **identidade** para destravar os papéis que precisam de estado por usuário
(Backtester, Sentinela, memória entre aparelhos) e, depois, a cobrança (Fase 2).

**Princípio:** a conta **não** é a chave da Anthropic. O usuário continua trazendo a
própria chave (BYOK); a conta serve só para identificar *quem é* — então "mesma chave em
aparelhos diferentes" deixa de ser problema (a identidade é a conta, não a chave). O app
**continua funcionando sem login**; a conta só adiciona sincronização e histórico na nuvem.

---

## O que você faz (setup — uma vez)

1. **Crie o projeto** em https://supabase.com → New project. Guarde a senha do banco.
2. **Rode o schema:** Supabase → **SQL Editor** → cole todo o `schema.sql` desta pasta → **Run**.
   Isso cria `profiles` e `predictions` com Row-Level Security (cada usuário só vê o seu).
3. **Ative o login por e-mail (magic-link):** Authentication → Providers → **Email** já vem
   ligado. Em Authentication → URL Configuration, ponha a URL do app (ex.: a do GitHub Pages)
   em *Site URL* e em *Redirect URLs* — é para onde o link do e-mail volta.
   - *Dev:* o Supabase manda e-mail por conta própria (com limite de taxa). *Produção:* configure
     um SMTP próprio (Auth → Emails) para não esbarrar no limite.
   - Google como opção depois: Providers → Google (precisa de um projeto no Google Cloud).
4. **Pegue as duas chaves públicas:** Project Settings → API →
   - `Project URL` (ex.: `https://xxxx.supabase.co`)
   - `anon public` key
   Ambas são **públicas por design** — quem protege os dados é a RLS, não o segredo da chave.
   (A chave `service_role` é secreta e **nunca** vai para o navegador — só será usada no Worker,
   na Fase 2, para os jobs que pontuam resultados.)
5. **Me mande** o `Project URL` + a `anon` key. Com elas eu faço a fiação do cliente (abaixo).

---

## O que eu faço em seguida (fiação do cliente — próxima sessão)

Assim que você me passar as duas chaves, eu implemento e testo:

- **Carregar o Supabase JS** no app (via CDN, sem build) e um guard: se as chaves não
  estiverem preenchidas, todo o código de conta fica **inerte** — o app segue idêntico ao de hoje.
- **UI de login** no rodapé da barra lateral (onde hoje está "Usuário · Plano API"): botão
  *Entrar*, campo de e-mail, magic-link; e o estado logado mostrando o e-mail + *Sair*.
- **Salvar previsão:** quando uma análise estruturada renderiza e o usuário está logado, grava
  uma linha em `predictions` (o 1X2, confiança, lambdas, tickets). Deslogado = comportamento atual.
- **Sincronizar histórico:** ao logar, o histórico de análises passa a vir da nuvem (some a "ilha"
  por navegador). Deslogado continua em localStorage.
- Tudo **opt-in e reversível** — nunca quebra o fluxo BYOK-sem-conta.

Depois disso, a Fase seguinte é o **Backtester** propriamente: uma tela "Meu Desempenho" que lê
`predictions` já pontuadas e mostra acurácia + calibração por confiança. E, quando você decidir
cobrar, a **Fase 2** (Stripe + `profiles.plan` + Worker medindo por conta) entra por cima desta
mesma fundação — sem retrabalho.

---

## Modelo de dados (resumo)

| Tabela | Papel |
|--------|-------|
| `auth.users` | gerenciada pelo Supabase (login) |
| `profiles` | 1:1 com o usuário · `plan` = base da cobrança futura |
| `predictions` | o que o modelo previu (1X2, confiança, lambdas, tickets) + resultado real (nulo até o jogo acabar) → alimenta o Backtester |

RLS em tudo: `auth.uid() = user_id`. A chave `service_role` (secreta, só no Worker) será o único
caminho para agregação entre usuários (calibração anônima) na Fase 2.
