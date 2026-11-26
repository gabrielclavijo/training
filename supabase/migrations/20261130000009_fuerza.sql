-- =============================================================================
-- «Tu fuerza»: dónde entrena la persona, qué equipo tiene y qué molestias
-- conviene cuidar, para armar las rutinas de fuerza del plan.
-- Cambio solo aditivo: una tabla nueva; no toca tablas ni datos existentes.
-- Solo la persona lo ve; no va a la IA ni al panel de administración.
-- =============================================================================

create table if not exists public.strength_prefs (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled         boolean not null default true,
  location        text not null default 'home' check (location in ('home', 'gym', 'both')),
  equipment       text[] not null default '{}'
    check (equipment <@ array['dumbbells', 'kettlebell', 'bands', 'pullup_bar', 'bench', 'step', 'fitball', 'trx']::text[]),
  dumbbell_max_kg numeric(5, 1) check (dumbbell_max_kg is null or dumbbell_max_kg between 0.5 and 100),
  experience      text not null default 'new' check (experience in ('new', 'some', 'regular')),
  discomfort      text[] not null default '{}'
    check (discomfort <@ array['knee', 'low_back', 'shoulder']::text[]),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists t_strength_prefs_updated on public.strength_prefs;
create trigger t_strength_prefs_updated before update on public.strength_prefs
  for each row execute function public.set_updated_at();

alter table public.strength_prefs enable row level security;

drop policy if exists own_select on public.strength_prefs;
drop policy if exists own_insert on public.strength_prefs;
drop policy if exists own_update on public.strength_prefs;
drop policy if exists own_delete on public.strength_prefs;
create policy own_select on public.strength_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.strength_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.strength_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.strength_prefs for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.strength_prefs to authenticated;
grant all on public.strength_prefs to service_role;
