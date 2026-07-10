/**
 * Meridian — Cloudflare Worker (proxy CORS)
 * ------------------------------------------
 * Um único Worker que faz proxy de DUAS APIs que o navegador não consegue chamar direto:
 *
 *   1. Anthropic   →  {worker}/v1/*        →  https://api.anthropic.com/v1/*
 *   2. API-Football→  {worker}/af/*        →  https://v3.football.api-sports.io/*
 *
 * Por que existe: navegadores bloqueiam (CORS) chamadas diretas à API-Football; e manter a
 * chave da Anthropic no servidor (aqui) é mais seguro do que no navegador. O Worker adiciona
 * os cabeçalhos CORS e injeta as chaves a partir das VARIÁVEIS DE AMBIENTE do Cloudflare —
 * nenhuma chave fica no código nem no repositório.
 *
 * Variáveis de ambiente (Cloudflare → Settings → Variables / Secrets):
 *   ANTHROPIC_KEY  (obrigatória se for usar o proxy da Anthropic)
 *   AF_KEY         (opcional — se ausente, o Worker usa a chave que o app enviar na query)
 *
 * Deploy: veja o README.md nesta pasta.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access, cache-diagnosis-2026-04-07',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    try {
      // ── API-Football: {worker}/af/<path>?<query> ──────────────────────────
      if (url.pathname.startsWith('/af/') || url.pathname === '/af') {
        const afPath = url.pathname.replace(/^\/af/, '') || '/';
        const params = new URLSearchParams(url.search);
        // A chave pode vir do app (query) OU do ambiente do Worker (mais seguro).
        const key = env.AF_KEY || params.get('x-apisports-key') || '';
        params.delete('x-apisports-key'); // não repassa a chave na URL upstream
        const qs = params.toString();
        const upstream = 'https://v3.football.api-sports.io' + afPath + (qs ? '?' + qs : '');
        const r = await fetch(upstream, { headers: { 'x-apisports-key': key, 'Accept': 'application/json' } });
        const body = await r.text();
        return new Response(body, {
          status: r.status,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      // ── Anthropic: {worker}/v1/<path> (streaming) ─────────────────────────
      if (url.pathname.startsWith('/v1/')) {
        if (!env.ANTHROPIC_KEY) {
          return new Response(JSON.stringify({ error: { message: 'ANTHROPIC_KEY não configurada no Worker' } }),
            { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
        }
        const upstream = 'https://api.anthropic.com' + url.pathname + url.search;
        // Repassa os cabeçalhos do cliente, mas injeta a chave a partir do ambiente
        // (o app NÃO envia x-api-key quando um Worker está configurado).
        const h = new Headers(request.headers);
        h.set('x-api-key', env.ANTHROPIC_KEY);
        if (!h.has('anthropic-version')) h.set('anthropic-version', '2023-06-01');
        h.delete('host');
        h.delete('anthropic-dangerous-direct-browser-access'); // desnecessário fora do navegador
        const r = await fetch(upstream, {
          method: request.method,
          headers: h,
          body: request.method === 'POST' ? request.body : undefined,
        });
        // Passa o corpo adiante (streaming SSE preservado) + CORS
        const ct = r.headers.get('content-type') || 'application/json';
        return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': ct } });
      }

      // ── Resumo do Dia: {worker}/daily ─────────────────────────────────────
      // Documento GLOBAL gerado pelo cron (scheduled) e guardado em KV. Sem chave,
      // sem estado por usuário — só leitura. Devolve {ok:false} enquanto não gerado.
      if (url.pathname === '/daily') {
        const cached = env.MERIDIAN_KV ? await env.MERIDIAN_KV.get('daily') : null;
        return new Response(cached || JSON.stringify({ ok: false }), {
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
        });
      }

      // ── Health check ──────────────────────────────────────────────────────
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true, service: 'meridian-proxy' }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      return new Response('Not found', { status: 404, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'proxy error: ' + (e && e.message || e) } }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  },

  // ── Cron (Sintetizador pós-rodada) ──────────────────────────────────────
  // Dispara pelo schedule do wrangler.toml (madrugada). Reutiliza ANTHROPIC_KEY
  // (a mesma do proxy) — nenhuma chave nova. waitUntil garante que o Worker não
  // encerre antes de gravar o KV.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(genDaily(env));
  },
};

// Gera o "Resumo do Dia" a partir de dados públicos (TheSportsDB, liga 4429) e grava
// um único documento em KV para todos os usuários. Silencioso em falha — o próximo
// cron tenta de novo; o app apenas não mostra o bloco enquanto não houver documento.
async function genDaily(env) {
  if (!env.ANTHROPIC_KEY || !env.MERIDIAN_KV) return;
  try {
    const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
    const [pastR, nextR] = await Promise.all([
      fetch(TSDB + '/eventspastleague.php?id=4429'),
      fetch(TSDB + '/eventsnextleague.php?id=4429'),
    ]);
    const past = pastR.ok ? await pastR.json() : null;
    const next = nextR.ok ? await nextR.json() : null;
    const line = (e) => `${e.dateEvent || ''} · ${e.strHomeTeam} ${(e.intHomeScore != null && e.intAwayScore != null) ? e.intHomeScore + 'x' + e.intAwayScore : '—'} ${e.strAwayTeam}${e.intRound ? ' (rodada ' + e.intRound + ')' : ''}`;
    const pastTxt = ((past && past.events) || []).slice(0, 12).map(line).join('\n');
    const nextTxt = ((next && next.events) || []).slice(0, 8).map(line).join('\n');
    if (!pastTxt && !nextTxt) return; // sem dados → não sobrescreve o documento anterior
    const facts = `RESULTADOS RECENTES:\n${pastTxt || '(sem dados)'}\n\nPRÓXIMOS JOGOS:\n${nextTxt || '(sem dados)'}`;
    const SP = 'Você é o editor do Meridian. Escreva um RESUMO DO DIA da Copa do Mundo 2026, curto e informativo, em pt-BR, a partir SOMENTE dos dados fornecidos. NUNCA invente resultados que não estejam nos dados. Responda APENAS JSON: {"titulo":"1 frase com o fato mais marcante do dia","destaques":["3 a 5 bullets curtos: resultados-chave, quem avançou/caiu, o próximo grande jogo"],"resumo":"2-3 frases de contexto do momento do torneio"}';
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: SP, messages: [{ role: 'user', content: facts }] });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body,
    });
    if (!r.ok) return;
    const data = await r.json();
    const txt = ((data.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const m = txt.match(/\{[\s\S]*\}/); if (!m) return;
    let obj; try { obj = JSON.parse(m[0]); } catch { return; }
    const out = {
      date: new Date().toISOString().slice(0, 10),
      generated_at: Date.now(),
      titulo: obj.titulo || '',
      destaques: Array.isArray(obj.destaques) ? obj.destaques.slice(0, 6) : [],
      resumo: obj.resumo || '',
    };
    await env.MERIDIAN_KV.put('daily', JSON.stringify(out));
  } catch (e) {
    // silencioso — próximo cron tenta de novo
  }
}
