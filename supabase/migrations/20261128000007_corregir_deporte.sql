-- =============================================================================
-- Corrige el deporte de actividades que quedaron como «gimnasio» u «otro»
-- aunque hubo desplazamiento (p. ej. Strava las exportó como «Workout»).
-- Misma regla que la app (src/core/activity/sport.ts → reconcileSport):
--   45 km o más, o 14 km/h o más → ciclismo; entre 6,5 y 14 km/h → running.
-- No se pierde nada: el valor anterior queda en activity_sport_fixes.
-- =============================================================================

create table if not exists public.activity_sport_fixes (
  activity_id    uuid primary key references public.activities (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  old_sport      text not null,
  old_sub_sport  text,
  new_sport      text not null,
  new_sub_sport  text,
  fixed_at       timestamptz not null default now()
);
alter table public.activity_sport_fixes enable row level security;
drop policy if exists own_select on public.activity_sport_fixes;
create policy own_select on public.activity_sport_fixes for select to authenticated using (user_id = (select auth.uid()));
grant select on public.activity_sport_fixes to authenticated;
grant all on public.activity_sport_fixes to service_role;

-- Aplica la corrección (se puede volver a ejecutar sin efectos dobles)
create or replace function public.fix_activity_sports() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with c as (
    select id, user_id, sport, sub_sport,
           distance_m / 1000.0 as km,
           case when moving_s is not null and moving_s >= 0.3 * elapsed_s then moving_s else elapsed_s end as secs
    from activities
    where sport in ('strength', 'other') and coalesce(distance_m, 0) >= 3000 and elapsed_s > 0
  ), d as (
    select *, case
      when km >= 45 or (secs > 0 and km / (secs / 3600.0) >= 14) then 'cycling'
      when secs > 0 and km / (secs / 3600.0) >= 6.5 then 'running'
    end as new_sport
    from c
  ), ins as (
    insert into activity_sport_fixes (activity_id, user_id, old_sport, old_sub_sport, new_sport, new_sub_sport)
    select id, user_id, sport, sub_sport, new_sport, case when new_sport = 'running' then 'road' end
    from d where new_sport is not null
    on conflict (activity_id) do nothing
    returning activity_id, new_sport, new_sub_sport
  ), upd as (
    update activities a set sport = ins.new_sport, sub_sport = ins.new_sub_sport
    from ins where a.id = ins.activity_id
    returning a.id
  )
  select count(*) into n from upd;

  -- Las fuentes (archivos) de esas actividades, para que la detección de duplicados siga funcionando
  update activity_sources s set sport = f.new_sport, sub_sport = f.new_sub_sport
  from activity_sport_fixes f
  where s.activity_id = f.activity_id and s.sport in ('strength', 'other');

  return n;
end $$;
revoke all on function public.fix_activity_sports() from public, anon, authenticated;
grant execute on function public.fix_activity_sports() to service_role;

select public.fix_activity_sports();
