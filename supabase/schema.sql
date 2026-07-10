-- ============================================================================
-- Meridian · Fase 1 (Contas) — schema Supabase / Postgres
-- ----------------------------------------------------------------------------
-- Cole TUDO isto no Supabase → SQL Editor → Run. Cria as tabelas do domínio +
-- Row-Level Security (cada usuário só enxerga/edita o que é dele). A tabela de
-- usuários (auth.users) é gerenciada pelo próprio Supabase — não a criamos aqui.
--
-- Modelo BYOK + contas: a conta NÃO é a chave da Anthropic. O usuário continua
-- trazendo a própria chave; a conta serve para IDENTIDADE (histórico entre
-- aparelhos, Backtester) e é a fundação da cobrança futura (Fase 2, campo "plan").
-- ============================================================================

-- 1) PERFIL (1:1 com o usuário) ------------------------------------------------
--    "plan" é a base da cobrança futura; hoje todo mundo é 'free' (BYOK).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  display_name text,
  plan         text not null default 'free',           -- 'free' (BYOK) | 'pro' (Fase 2)
  settings     jsonb not null default '{}'::jsonb
);

-- Cria o perfil automaticamente quando um usuário se cadastra.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) PREVISÕES (núcleo do Backtester) -----------------------------------------
--    Registra o que o modelo PREVIU. Os campos de RESULTADO ficam nulos até o
--    jogo terminar (preenchidos depois — manualmente ou por um job na Fase 2).
--    Com isso dá para medir acurácia e CALIBRAÇÃO por nível de confiança
--    (ex.: "tickets de 'alta confiança' acertaram 71%").
create table if not exists public.predictions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),

  -- identificação do jogo
  home         text not null,
  away         text not null,
  match_label  text,                                   -- "França x Marrocos"
  match_date   date,                                   -- p/ saber quando pontuar
  phase        text,
  model        text,                                   -- modelo que gerou (comparar qualidade)

  -- o que o modelo PREVIU
  prob_home    numeric,                                -- 1X2 (0..1)
  prob_draw    numeric,
  prob_away    numeric,
  confidence   text,                                   -- 'alto' | 'medio' | 'baixo'
  lambda_home  numeric,                                -- p/ calibrar mercados de gols
  lambda_away  numeric,
  tickets      jsonb not null default '[]'::jsonb,     -- [{descricao,probabilidade,confianca}]
  local_hid    text,                                   -- link com o id local da análise

  -- RESULTADO REAL (nulo até o jogo acabar)
  result_home  int,
  result_away  int,
  outcome      text,                                   -- 'home' | 'draw' | 'away'
  tickets_result jsonb,                                -- [{descricao, acertou:true|false}]
  scored_at    timestamptz
);

create index if not exists predictions_user_idx    on public.predictions (user_id, created_at desc);
create index if not exists predictions_pending_idx  on public.predictions (match_date) where scored_at is null;

-- 3) ROW-LEVEL SECURITY — cada usuário só vê/edita o que é seu -----------------
alter table public.profiles    enable row level security;
alter table public.predictions enable row level security;

drop policy if exists "perfil proprio - ver"    on public.profiles;
drop policy if exists "perfil proprio - editar" on public.profiles;
create policy "perfil proprio - ver"    on public.profiles for select using (auth.uid() = id);
create policy "perfil proprio - editar" on public.profiles for update using (auth.uid() = id);

drop policy if exists "previsoes proprias - ver"     on public.predictions;
drop policy if exists "previsoes proprias - inserir"  on public.predictions;
drop policy if exists "previsoes proprias - editar"   on public.predictions;
drop policy if exists "previsoes proprias - apagar"   on public.predictions;
create policy "previsoes proprias - ver"     on public.predictions for select using (auth.uid() = user_id);
create policy "previsoes proprias - inserir"  on public.predictions for insert with check (auth.uid() = user_id);
create policy "previsoes proprias - editar"   on public.predictions for update using (auth.uid() = user_id);
create policy "previsoes proprias - apagar"   on public.predictions for delete using (auth.uid() = user_id);

-- ============================================================================
-- FUTURO (não rodar agora — só referência):
--  · Fase 2 (cobrança): tabela public.subscriptions (stripe_customer, status,
--    current_period_end) + webhook do Stripe atualizando profiles.plan.
--  · Calibração agregada e ANÔNIMA entre todos os usuários: função
--    SECURITY DEFINER que agrega hit-rate por confiança sem expor linhas
--    individuais (estatisticamente mais forte e sem risco de privacidade).
-- ============================================================================
