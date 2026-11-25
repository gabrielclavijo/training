-- =============================================================================
-- Panel de administración: uso de la app y costo de la IA.
--   - usage_daily: minutos y visitas por persona y día (hora de Colombia).
--     La persona solo lo suma con track_usage() (máximo 1 minuto por señal,
--     limitado por el tiempo real transcurrido) y puede leer lo suyo.
--   - ai_usage: ahora guarda tokens, modelo y costo de cada petición.
--   - admin_topups / admin_settings: recargas de saldo y umbral de aviso.
--     Solo los lee y escribe el servidor (función admin-stats).
-- Los datos de uso se borran a los 12 meses.
-- =============================================================================

create table public.usage_daily (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,
  seconds      integer not null default 0 check (seconds between 0 and 86400),
  visits       integer not null default 0 check (visits >= 0),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index on public.usage_daily (day);
create index on public.usage_daily (last_seen_at desc);

alter table public.usage_daily enable row level security;
create policy own_select on public.usage_daily for select to authenticated using (user_id = (select auth.uid()));
grant select on public.usage_daily to authenticated;
grant all on public.usage_daily to service_role;

-- Señal de uso: la llama la app cada minuto mientras está a la vista.
-- Suma como máximo lo que realmente pasó desde la señal anterior (≤ 60 s),
-- así nadie puede inflar sus minutos llamándola muchas veces.
create or replace function public.track_usage(p_seconds integer, p_new_visit boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Bogota')::date;
  prev timestamptz;
  add_s integer;
begin
  if uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select last_seen_at into prev from public.usage_daily where user_id = uid and day = today;
  add_s := least(greatest(coalesce(p_seconds, 0), 0), 60);
  if prev is not null then
    add_s := least(add_s, greatest(0, floor(extract(epoch from (now() - prev)))::integer));
  else
    add_s := 0; -- primera señal del día: abre la visita
  end if;
  insert into public.usage_daily as u (user_id, day, seconds, visits, last_seen_at)
  values (uid, today, add_s, case when p_new_visit or prev is null then 1 else 0 end, now())
  on conflict (user_id, day) do update
    set seconds = least(86400, u.seconds + add_s),
        visits = u.visits + case when p_new_visit then 1 else 0 end,
        last_seen_at = now();
end $$;
revoke execute on function public.track_usage(integer, boolean) from public, anon;
grant execute on function public.track_usage(integer, boolean) to authenticated;

-- Costo de la IA por petición
alter table public.ai_usage
  add column model         text,
  add column input_tokens  integer not null default 0,
  add column output_tokens integer not null default 0,
  add column cost_usd      numeric(10, 5) not null default 0,
  -- false: el intento falló; queda su costo pero no cuenta para el límite diario
  add column counted       boolean not null default true;

-- Recargas de saldo y ajustes del panel: solo el servidor
create table public.admin_topups (
  id         uuid primary key default gen_random_uuid(),
  amount_usd numeric(10, 2) not null check (amount_usd > 0 and amount_usd < 100000),
  note       text check (char_length(note) <= 200),
  topped_on  date not null default (now() at time zone 'America/Bogota')::date,
  created_at timestamptz not null default now()
);
create table public.admin_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_topups enable row level security;
alter table public.admin_settings enable row level security;
-- Sin políticas para el navegador: nadie con sesión normal los ve ni los cambia
grant all on public.admin_topups, public.admin_settings to service_role;

-- Borrado automático: datos de uso de más de 12 meses (junto con la limpieza de Strava)
create or replace function public.purge_old_usage()
returns integer language sql security definer set search_path = public as $$
  with gone as (
    delete from public.usage_daily
    where day < ((now() at time zone 'America/Bogota')::date - interval '12 months')
    returning 1
  )
  select count(*)::integer from gone
$$;
revoke execute on function public.purge_old_usage() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-old-usage', '41 4 * * *', 'select public.purge_old_usage()');
  end if;
end $$;
