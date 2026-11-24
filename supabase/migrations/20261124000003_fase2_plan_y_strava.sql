-- =============================================================================
-- Fase 2: disponibilidad, plan de entrenamiento adaptativo y conexión con Strava
-- Mismas convenciones de la fase 1: user_id + RLS en todo, llaves compuestas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Disponibilidad para entrenar
-- ---------------------------------------------------------------------------
create table public.training_availability (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Minutos máximos por día de la semana (lunes = 1 … domingo = 7); 0 = no entrena
  minutes_by_day jsonb not null default '{"1":60,"2":60,"3":60,"4":60,"5":0,"6":150,"7":90}',
  long_day       smallint not null default 6 check (long_day between 1 and 7),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plan: cada recálculo es una versión; las semanas y sesiones futuras se
-- reemplazan, las pasadas se conservan como historial.
-- ---------------------------------------------------------------------------
create table public.training_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason     text not null check (reason in ('initial', 'goals_changed', 'pause', 'availability', 'weekly', 'adaptation', 'manual')),
  inputs     jsonb not null default '{}',
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.training_plans (user_id, created_at desc);

create table public.plan_weeks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id     uuid not null,
  week_start  date not null,
  phase       text not null check (phase in ('base', 'build', 'recovery_week', 'taper', 'event', 'recovery', 'return', 'pause', 'maintenance')),
  goal_id     uuid,
  target_load numeric(6, 1) not null check (target_load >= 0),
  notes       jsonb not null default '[]',
  is_demo     boolean not null default false,
  unique (user_id, week_start),
  foreign key (plan_id, user_id) references public.training_plans (id, user_id) on delete cascade,
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);

create table public.planned_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id      uuid not null,
  goal_id      uuid,
  date         date not null,
  sport        text not null check (sport in ('cycling', 'running', 'swimming', 'strength', 'other')),
  kind         text not null check (kind in ('easy', 'long', 'tempo', 'threshold', 'vo2', 'climb', 'recovery', 'strength', 'openers', 'event', 'rest')),
  duration_min smallint not null check (duration_min between 0 and 1440),
  planned_load numeric(6, 1) not null default 0,
  structure    jsonb not null default '{}', -- bloques: [{minutes, zone, repeat, restMinutes}]
  phase        text,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_id, user_id) references public.training_plans (id, user_id) on delete cascade,
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index on public.planned_sessions (user_id, date);

-- La actividad que cumplió una sesión (el estado hecha/parcial/más dura se
-- calcula al vuelo: no se guardan cálculos derivados de datos de Strava).
alter table public.activities
  add constraint activities_planned_session_fk
  foreign key (planned_session_id, user_id) references public.planned_sessions (id, user_id)
  on delete set null (planned_session_id);

create table public.plan_changes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id    uuid not null,
  reason     text not null,        -- código (se traduce en la app)
  params     jsonb not null default '{}',
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (plan_id, user_id) references public.training_plans (id, user_id) on delete cascade
);
create index on public.plan_changes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Strava: bandeja de entrada de actividades que llegan por webhook.
-- Política de la API de Strava: caché de máximo 7 días y nunca para IA.
-- La app la procesa (detección de duplicados) y la vacía.
-- ---------------------------------------------------------------------------
create table public.provider_inbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null check (provider in ('strava', 'garmin_api')),
  external_id text not null,
  event       text not null check (event in ('create', 'update', 'delete')),
  payload     jsonb,
  received_at timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  unique (user_id, provider, external_id)
);

alter table public.connections
  add column if not exists backfill_done_at timestamptz,
  add column if not exists last_backup_sync_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['training_availability', 'training_plans', 'plan_weeks', 'planned_sessions', 'plan_changes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy own_select on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_insert on public.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_update on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_delete on public.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Bandeja de Strava: la escribe solo el servidor (webhook); la persona la lee y la vacía.
alter table public.provider_inbox enable row level security;
create policy own_select on public.provider_inbox for select to authenticated using (user_id = (select auth.uid()));
create policy own_delete on public.provider_inbox for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.training_availability, public.training_plans, public.plan_weeks,
  public.planned_sessions, public.plan_changes to authenticated;
grant select, delete on public.provider_inbox to authenticated;
grant all on public.training_availability, public.training_plans, public.plan_weeks, public.planned_sessions,
  public.plan_changes, public.provider_inbox to service_role;

-- ---------------------------------------------------------------------------
-- Borrado automático de datos de Strava (7 días), también de la bandeja
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_provider_data()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  delete from public.provider_inbox where expires_at < now();
  with gone as (
    delete from public.activity_sources
    where retention_class = 'strava_cache' and streams_expire_at < now()
    returning activity_id
  )
  delete from public.activities a
  using (select distinct activity_id from gone) g
  where a.id = g.activity_id
    and not exists (select 1 from public.activity_sources s where s.activity_id = a.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_provider_data() from public, anon, authenticated;

-- Programarlo cada hora si pg_cron está disponible (en Supabase lo está)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-provider-cache', '17 * * * *', 'select public.purge_expired_provider_data()');
  end if;
exception when others then
  raise notice 'pg_cron no disponible: programar purge_expired_provider_data() a mano';
end $$;
