-- =============================================================================
-- «¿Cómo te sientes hoy?»: un registro por persona y día.
-- Cambio solo aditivo: una tabla nueva; no toca tablas ni datos existentes.
-- Solo la persona lo ve; no va a la IA ni al panel de administración.
-- =============================================================================

create table if not exists public.daily_checkins (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  feeling    smallint not null check (feeling between 1 and 5),
  tags       text[] not null default '{}'
    check (cardinality(tags) <= 6 and tags <@ array['slept_bad', 'tired_legs', 'stress', 'energized', 'sick']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

drop trigger if exists t_daily_checkins_updated on public.daily_checkins;
create trigger t_daily_checkins_updated before update on public.daily_checkins
  for each row execute function public.set_updated_at();

alter table public.daily_checkins enable row level security;

drop policy if exists own_select on public.daily_checkins;
drop policy if exists own_insert on public.daily_checkins;
drop policy if exists own_update on public.daily_checkins;
drop policy if exists own_delete on public.daily_checkins;
create policy own_select on public.daily_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.daily_checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.daily_checkins for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.daily_checkins for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.daily_checkins to authenticated;
grant all on public.daily_checkins to service_role;
