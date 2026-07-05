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
};
