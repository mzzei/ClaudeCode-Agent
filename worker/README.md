# Meridian — Worker proxy (Cloudflare)

Um Worker serverless (grátis) que resolve dois problemas de uma vez:

1. **API-Football não funciona no navegador** (CORS bloqueia). O Worker chama a AF do lado do servidor e devolve com CORS → técnico, escalação e estatísticas passam a funcionar.
2. **Chave da Anthropic no navegador** é menos seguro. Com o Worker, a chave fica no servidor (variável de ambiente), e o navegador não a envia.

Rotas: `{worker}/af/*` → API-Football · `{worker}/v1/*` → Anthropic · `{worker}/daily` → Resumo do Dia (leitura).

Além do proxy, o Worker roda um **cron** que gera o **Resumo do Dia** da Copa (papel "Sintetizador pós-rodada"): conteúdo global, um documento para todos os usuários, sem custo para eles. Veja a seção própria abaixo.

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

## Resumo do Dia (cron + KV) — setup uma vez

O Worker gera de madrugada (`08:00 UTC = 05:00 BRT`) um resumo do dia da Copa a partir de dados públicos (TheSportsDB) usando **a mesma `ANTHROPIC_KEY`** já configurada — nenhuma chave nova. Custa ~1 centavo/dia (uma chamada Haiku) e o resultado é **global**: todos os usuários veem o mesmo bloco "📰 Resumo do Dia" no painel direito, sem gastar a chave deles.

Falta só criar o **KV** (o armazenamento onde o resumo fica):

```bash
cd worker
npx wrangler kv namespace create MERIDIAN_KV
# copie o "id" retornado e cole em wrangler.toml (placeholder COLE_AQUI_O_ID_DO_KV)
npx wrangler deploy
```

Pelo painel (sem CLI): **Workers & Pages → KV → Create namespace** (nome `MERIDIAN_KV`) → no seu Worker, **Settings → Bindings → Add → KV namespace** (Variable name: `MERIDIAN_KV`). O cron já está no `wrangler.toml`; pelo painel, confira em **Settings → Triggers → Cron Triggers**.

- **Testar sem esperar a madrugada:** no painel do Worker, **Triggers → Cron → "Trigger"** (ou `npx wrangler dev` e dispare o scheduled). Depois abra `{worker}/daily` no navegador — deve retornar o JSON `{titulo, destaques, resumo}`. Enquanto não gerar, retorna `{ "ok": false }` e o app simplesmente não mostra o bloco.
- **Tornar global mesmo para quem não configurou Worker:** no `index.html`, preencha a constante `MERIDIAN_DAILY_URL` com a URL pública `https://SEU-WORKER.workers.dev/daily`. Vazio = o app usa o Worker que o próprio usuário configurou.

## Segurança

- Nenhuma chave fica no código nem no repositório — só nas *Secrets* do Cloudflare.
- Se a sua chave AF já foi exposta em algum lugar, **rotacione-a** no painel da API-Football e use a nova (de preferência no modo "chave só no servidor" acima).
- O CORS está aberto (`*`) por simplicidade; se quiser restringir, troque `Access-Control-Allow-Origin` no `worker.js` pela URL do seu site.
