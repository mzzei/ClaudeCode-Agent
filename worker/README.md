# Meridian — Worker proxy (Cloudflare)

Um Worker serverless (grátis) que resolve dois problemas de uma vez:

1. **API-Football não funciona no navegador** (CORS bloqueia). O Worker chama a AF do lado do servidor e devolve com CORS → técnico, escalação e estatísticas passam a funcionar.
2. **Chave da Anthropic no navegador** é menos seguro. Com o Worker, a chave fica no servidor (variável de ambiente), e o navegador não a envia.

Rotas: `{worker}/af/*` → API-Football · `{worker}/v1/*` → Anthropic · `{worker}/daily` → Resumo do Dia (opcional, ver nota no fim).

---

## Deploy em 5 minutos (painel Cloudflare, sem instalar nada)

1. Crie conta grátis em https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**.
2. Dê um nome (ex.: `meridian-proxy`) → **Deploy** (cria um Worker vazio).
3. **Edit code** → apague o conteúdo → cole todo o `worker.js` desta pasta → **Deploy**.
4. **Settings → Variables and Secrets** → adicione (como *Secret*, tipo "Encrypt"):
   - `ANTHROPIC_KEY` = sua chave `sk-ant-...` (se for usar o proxy da Anthropic)
   - `AF_KEY` = sua chave da API-Football (recomendado deixar aqui; assim ela nunca entra no navegador)
5. Copie a URL do Worker (algo como `https://meridian-proxy.SEU-USUARIO.workers.dev`).
6. No app **Meridian → Configurações → Worker URL (Cloudflare)**: cole a URL. Pronto.

### Alternativa por linha de comando (wrangler)

```bash
cd worker
npx wrangler deploy
npx wrangler secret put ANTHROPIC_KEY   # cola a chave quando pedir
npx wrangler secret put AF_KEY          # cola a chave quando pedir
```

---

## Como o app usa

Para o app **usar a API-Football, é preciso ter algo no campo "API Key API-Football" em Configurações** (é o que liga a AF). Com a Worker URL também configurada, o app chama `{worker}/af/...` em vez da AF direta → o Worker resolve o CORS. Duas formas:

- **Simples (relay):** ponha a sua chave AF real em Configurações. O app a envia ao *seu* Worker (não a um proxy público), que a repassa à AF.
- **Mais seguro (chave só no servidor):** ponha a `AF_KEY` como *Secret* no Worker e, no campo de Configurações, ponha só um marcador qualquer (ex.: `worker`) para ligar a AF. O Worker **prioriza a `AF_KEY` do ambiente** e ignora o que o app enviar — assim a chave real nunca entra no navegador.

Anthropic: o app já roteava `/v1/messages` pela Worker URL; o Worker injeta a `ANTHROPIC_KEY`. Se a AF falhar por qualquer motivo, o app cai automaticamente na ESPN (nada quebra).

## Segurança

- Nenhuma chave fica no código nem no repositório — só nas *Secrets* do Cloudflare.
- Se a sua chave AF já foi exposta em algum lugar, **rotacione-a** no painel da API-Football e use a nova (de preferência no modo "chave só no servidor" acima).
- O CORS está aberto (`*`) por simplicidade; se quiser restringir, troque `Access-Control-Allow-Origin` no `worker.js` pela URL do seu site.

---

## Resumo do Dia (`/daily`) — opcional, não prioritário

**Status honesto:** esta feature é cosmética, não estrutural. Foi construída como a
prova mais barata/sem-risco de que o Worker podia rodar cron + gravar estado — não
porque agregue inteligência de análise. Ela gera uma manchete diária ("hoje a Suíça
eliminou a Colômbia…") e não interage com o pipeline de análise (coletor → portão →
analista → verificador), que é o cérebro de verdade e já roda 100% no navegador,
sem depender de nada disto.

**Não é pré-requisito para nada.** O app funciona por completo sem ela — o bloco
"📰 Resumo do Dia" simplesmente não aparece se o KV não existir (`{worker}/daily`
devolve `{"ok": false}`, e o app degrada em silêncio). Não bloqueia lançamento, não
bloqueia os próximos papéis (Backtester, Sentinela) — eles usam Supabase/contas,
não este KV.

Se um dia quiser ligá-la mesmo assim (baixo custo, ~1 centavo/dia):

```bash
cd worker
npx wrangler kv namespace create MERIDIAN_KV
# copie o "id" retornado e cole em wrangler.toml (placeholder COLE_AQUI_O_ID_DO_KV)
npx wrangler deploy
```

Pelo painel: **Workers & Pages → KV → Create namespace** (`MERIDIAN_KV`) → no seu
Worker, **Settings → Bindings → Add → KV namespace**. Teste sem esperar a madrugada
em **Triggers → Cron → "Trigger"**, depois abra `{worker}/daily`.
