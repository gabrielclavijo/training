-- =============================================================================
-- Esquema de la fase 1 (pensado para crecer en las fases 2 y 3 sin rehacerlo)
--
-- Convenciones
--   * Todas las tablas tienen user_id y Row Level Security (RLS): cada persona
--     solo lee y escribe sus filas (user_id = auth.uid()).
--   * Las tablas hijas usan llaves foráneas compuestas (id, user_id) para que
--     nadie pueda colgar una fila suya de una fila ajena.
--   * Medidas en SI (m, s, kg, W, m/s). Fechas con hora en timestamptz (UTC).
--   * is_demo marca los datos de prueba para poder borrarlos de una vez.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Persona
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  display_name       text check (char_length(display_name) <= 80),
  birth_date         date check (birth_date > date '1900-01-01'),
  sex_for_formulas   text check (sex_for_formulas in ('female', 'male')),
  height_cm          numeric(5, 1) check (height_cm between 100 and 250),
  theme              text not null default 'system' check (theme in ('light', 'dark', 'system')),
  locale             text not null default 'es-CO',
  unit_system        text not null default 'metric' check (unit_system in ('metric')),
  timezone           text not null default 'America/Bogota',
  adult_confirmed    boolean not null default false,
  onboarding_step    smallint not null default 0,
  onboarding_done_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on column public.profiles.sex_for_formulas is 'Solo se usa en fórmulas fisiológicas (FC máxima, calorías).';

create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg   numeric(5, 2) not null check (weight_kg between 25 and 350),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- Umbrales con fecha de vigencia: un FTP nuevo no reescribe la carga pasada.
create table public.physiology_settings (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  effective_from         date not null,
  hr_rest                smallint check (hr_rest between 25 and 120),
  hr_max                 smallint check (hr_max between 100 and 230),
  hr_max_source          text check (hr_max_source in ('measured', 'estimated')),
  hr_threshold           smallint check (hr_threshold between 80 and 220),
  ftp_w                  smallint check (ftp_w between 50 and 600),
  run_threshold_s_per_km numeric(6, 1) check (run_threshold_s_per_km between 120 and 900),
  swim_threshold_s_per_100m numeric(6, 1) check (swim_threshold_s_per_100m between 50 and 400),
  is_demo                boolean not null default false,
  created_at             timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consent_type   text not null check (consent_type in ('privacy_policy', 'health_data')),
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);
create index on public.consents (user_id, consent_type);

-- Datos médicos y de laboratorio: SOLO texto cifrado (AES-GCM, lo hace la Edge
-- Function health-crypto). El navegador puede leer el texto cifrado y borrar,
-- pero no escribir: así todo pasa por el cifrado y el control de consentimiento.
create table public.health_records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category    text not null check (category in ('medication', 'allergy', 'lab_result')),
  ciphertext  text not null,
  iv          text not null,
  key_version smallint not null default 1,
  recorded_on date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.health_records (user_id, category);

create or replace function public.has_health_consent(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.consents
    where user_id = uid and consent_type = 'health_data' and revoked_at is null
  )
$$;

create or replace function public.require_health_consent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_health_consent(new.user_id) then
    raise exception 'Se necesita el consentimiento para datos de salud' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger health_records_consent
  before insert or update on public.health_records
  for each row execute function public.require_health_consent();

-- Lo ÚNICO que en la fase 3 podrá recibir la IA (junto con la meta de peso y un
-- rango de calorías calculado del perfil). Las alergias van cifradas aparte.
create table public.nutrition_preferences (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  diet_type      text not null default 'omnivore' check (diet_type in ('omnivore', 'vegetarian', 'vegan')),
  excluded_foods text[] not null default '{}',
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fuentes e importación
-- ---------------------------------------------------------------------------
create table public.connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider            text not null check (provider in ('file', 'manual', 'strava', 'garmin_api')),
  status              text not null default 'active'
                        check (status in ('active', 'disabled', 'error', 'not_available')),
  external_athlete_id text,
  last_sync_at        timestamptz,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, provider),
  unique (id, user_id)
);

-- Tokens de proveedores (Strava/Garmin a futuro). Sin políticas RLS: el
-- navegador no puede leerla nunca; solo las Edge Functions con la clave de servicio.
create table public.provider_tokens (
  connection_id uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[],
  updated_at    timestamptz not null default now(),
  foreign key (connection_id, user_id) references public.connections (id, user_id) on delete cascade
);

create table public.import_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('files', 'strava_archive', 'garmin_archive', 'provider_sync', 'demo')),
  status      text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  total       integer not null default 0 check (total >= 0),
  processed   integer not null default 0 check (processed >= 0),
  imported    integer not null default 0,
  merged      integer not null default 0,
  duplicates  integer not null default 0,
  failed      integer not null default 0,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, user_id)
);

create table public.import_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id             uuid not null,
  filename           text not null,
  status             text not null check (status in ('imported', 'merged', 'duplicate', 'skipped', 'error')),
  error_code         text,
  activity_source_id uuid,
  created_at         timestamptz not null default now(),
  foreign key (job_id, user_id) references public.import_jobs (id, user_id) on delete cascade
);
create index on public.import_items (job_id);

-- ---------------------------------------------------------------------------
-- Actividades y duplicados
--   activities        = la actividad única que ve la persona
--   activity_sources  = cada llegada de esa actividad (archivo, Strava, manual…)
-- ---------------------------------------------------------------------------
create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport              text not null check (sport in ('cycling', 'running', 'swimming', 'strength', 'other')),
  sub_sport          text check (sub_sport in ('road', 'mtb', 'gravel', 'indoor', 'track', 'trail',
                                               'treadmill', 'pool', 'open_water', 'generic')),
  title              text check (char_length(title) <= 200),
  start_time         timestamptz not null,
  timezone           text,
  elapsed_s          integer not null check (elapsed_s >= 0),
  moving_s           integer check (moving_s >= 0),
  distance_m         numeric(10, 1) check (distance_m >= 0),
  elevation_gain_m   numeric(7, 1) check (elevation_gain_m >= 0),
  avg_hr             smallint,
  max_hr             smallint,
  avg_power_w        smallint,
  normalized_power_w smallint,
  avg_cadence        smallint,
  avg_speed_ms       numeric(6, 3),
  has_power          boolean not null default false,
  has_hr             boolean not null default false,
  has_gps            boolean not null default false,
  has_cadence        boolean not null default false,
  rpe                smallint check (rpe between 1 and 10),
  rpe_is_estimated   boolean not null default false,
  notes              text,
  -- De qué fuente salió cada tipo de dato tras una fusión
  primary_source_id  uuid,
  power_source_id    uuid,
  hr_source_id       uuid,
  gps_source_id      uuid,
  cadence_source_id  uuid,
  planned_session_id uuid, -- fase 2: sesión del plan que cumplió esta actividad
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.activities (user_id, start_time desc);

create table public.activity_sources (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id        uuid not null,
  provider           text not null check (provider in ('file', 'manual', 'strava', 'garmin_api', 'demo')),
  source_format      text not null check (source_format in ('fit', 'gpx', 'tcx', 'manual', 'strava_api', 'garmin_api')),
  origin_hint        text check (origin_hint in ('strava_export', 'garmin_export', 'device_file', 'other')),
  external_id        text,
  device_serial      text,
  device_name        text,
  file_sha256        text,
  original_filename  text,
  sport              text not null,
  sub_sport          text,
  raw_sport          text,
  title              text,
  start_time         timestamptz not null,
  timezone           text,
  elapsed_s          integer not null,
  moving_s           integer,
  distance_m         numeric(10, 1),
  elevation_gain_m   numeric(7, 1),
  avg_hr             smallint,
  max_hr             smallint,
  avg_power_w        smallint,
  normalized_power_w smallint,
  avg_cadence        smallint,
  avg_speed_ms       numeric(6, 3),
  has_power          boolean not null default false,
  has_hr             boolean not null default false,
  has_gps            boolean not null default false,
  has_cadence        boolean not null default false,
  hr_samples         integer not null default 0,
  power_samples      integer not null default 0,
  gps_points         integer not null default 0,
  -- Resúmenes que permiten recalcular la carga sin el archivo original
  hr_histogram       jsonb,   -- [[ppm, segundos], …]
  power_histogram    jsonb,   -- [[vatios (de a 5), segundos], …]
  power_curve        jsonb,   -- {"5": W, "60": W, "300": W, "1200": W, "3600": W}
  streams_path       text,    -- archivo comprimido en Storage (últimos 12 meses)
  streams_expire_at  timestamptz,
  -- Reglas de cada proveedor: lo de Strava se borra a los 7 días y nunca va a IA
  retention_class    text not null default 'owned' check (retention_class in ('owned', 'strava_cache')),
  ai_allowed         boolean not null default true,
  import_job_id      uuid,
  is_demo            boolean not null default false,
  imported_at        timestamptz not null default now(),
  unique (id, user_id),
  check (retention_class <> 'strava_cache' or (ai_allowed = false and streams_expire_at is not null)),
  foreign key (activity_id, user_id) references public.activities (id, user_id) on delete cascade
);
create index on public.activity_sources (activity_id);
create index on public.activity_sources (user_id, start_time);
create unique index activity_sources_same_file on public.activity_sources (user_id, file_sha256)
  where file_sha256 is not null;
create unique index activity_sources_same_external on public.activity_sources (user_id, provider, external_id)
  where external_id is not null;

alter table public.activities
  add foreign key (primary_source_id, user_id) references public.activity_sources (id, user_id)
    on delete set null (primary_source_id),
  add foreign key (power_source_id, user_id) references public.activity_sources (id, user_id)
    on delete set null (power_source_id),
  add foreign key (hr_source_id, user_id) references public.activity_sources (id, user_id)
    on delete set null (hr_source_id),
  add foreign key (gps_source_id, user_id) references public.activity_sources (id, user_id)
    on delete set null (gps_source_id),
  add foreign key (cadence_source_id, user_id) references public.activity_sources (id, user_id)
    on delete set null (cadence_source_id);

create table public.activity_merges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id uuid not null,
  source_id   uuid not null,
  matched_by  text not null check (matched_by in ('device_and_time', 'tolerance', 'user')),
  deltas      jsonb not null default '{}', -- {"start_min":1.2,"duration_pct":0.8,"distance_pct":0.4}
  created_at  timestamptz not null default now(),
  undone_at   timestamptz,
  foreign key (activity_id, user_id) references public.activities (id, user_id) on delete cascade
);
create index on public.activity_merges (activity_id);

-- Pares que la persona marcó como "No son la misma actividad".
create table public.activity_not_duplicates (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_a   uuid not null,
  source_b   uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, source_a, source_b),
  check (source_a < source_b),
  foreign key (source_a, user_id) references public.activity_sources (id, user_id) on delete cascade,
  foreign key (source_b, user_id) references public.activity_sources (id, user_id) on delete cascade
);

create table public.activity_load (
  activity_id            uuid primary key,
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  method                 text not null check (method in ('power_tss', 'hr_tss', 'trimp', 'rpe', 'none')),
  load                   numeric(6, 1),
  confidence             text check (confidence in ('high', 'medium', 'low')),
  inputs                 jsonb not null default '{}',
  missing_hint           text,
  physiology_settings_id uuid references public.physiology_settings (id) on delete set null,
  computed_at            timestamptz not null default now(),
  check ((method = 'none') = (load is null)),
  foreign key (activity_id, user_id) references public.activities (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Metas, temporada y pausas
-- ---------------------------------------------------------------------------
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  starts_on  date not null,
  ends_on    date not null check (ends_on >= starts_on),
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  season_id        uuid,
  name             text not null check (char_length(name) between 1 and 120),
  sport            text not null check (sport in ('cycling', 'running', 'swimming', 'strength', 'other')),
  sub_sport        text,
  event_date       date not null,
  priority         text not null default 'primary' check (priority in ('primary', 'secondary')),
  goal_type        text not null default 'single' check (goal_type in ('single', 'stage')),
  objective        text not null default 'finish' check (objective in ('finish', 'time')),
  target_time_s    integer check (target_time_s > 0),
  distance_m       numeric(10, 1) check (distance_m >= 0),
  elevation_gain_m numeric(7, 1) check (elevation_gain_m >= 0),
  terrain          text check (terrain in ('paved', 'unpaved', 'mixed', 'technical', 'track', 'pool', 'open_water')),
  max_altitude_m   numeric(6, 0) check (max_altitude_m between -500 and 9000),
  gpx_path         text,
  notes            text,
  status           text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (season_id, user_id) references public.seasons (id, user_id) on delete set null (season_id)
);
create index on public.goals (user_id, event_date);

create table public.goal_stages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id          uuid not null,
  stage_number     smallint not null check (stage_number between 1 and 30),
  day_offset       smallint not null default 0 check (day_offset between 0 and 60),
  distance_m       numeric(10, 1) not null check (distance_m >= 0),
  elevation_gain_m numeric(7, 1) not null default 0 check (elevation_gain_m >= 0),
  terrain          text check (terrain in ('paved', 'unpaved', 'mixed', 'technical', 'track', 'pool', 'open_water')),
  target_time_s    integer check (target_time_s > 0),
  unique (goal_id, stage_number),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

-- Bloques de la temporada (preparación, disminución, evento, recuperación).
-- Fase 1: los calcula la app de forma simple; fase 2: el plan adaptativo.
create table public.season_blocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid,
  kind         text not null check (kind in ('base', 'build', 'taper', 'event', 'recovery', 'transition')),
  starts_on    date not null,
  ends_on      date not null check (ends_on >= starts_on),
  generated_by text not null default 'system' check (generated_by in ('system', 'user')),
  created_at   timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

-- Pausas: se registran desde ya; en la fase 2 reajustan toda la temporada.
create table public.pauses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('illness', 'injury', 'travel', 'vacation', 'other')),
  starts_on       date not null,
  ends_on         date check (ends_on >= starts_on),
  can_train       boolean,
  available       text[] not null default '{}'
                    check (available <@ array['bike', 'run', 'gym', 'pool', 'none']::text[]),
  minutes_per_day smallint check (minutes_per_day between 0 and 600),
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create trigger t_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger t_connections_updated before update on public.connections for each row execute function public.set_updated_at();
create trigger t_activities_updated before update on public.activities for each row execute function public.set_updated_at();
create trigger t_goals_updated before update on public.goals for each row execute function public.set_updated_at();
create trigger t_health_updated before update on public.health_records for each row execute function public.set_updated_at();
create trigger t_nutrition_updated before update on public.nutrition_preferences for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perfil y conexión de archivos creados al registrarse
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''));
  insert into public.connections (user_id, provider, status) values
    (new.id, 'file', 'active'),
    (new.id, 'manual', 'active'),
    (new.id, 'strava', 'not_available'),
    (new.id, 'garmin_api', 'not_available');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Tablas donde la persona puede leer, crear, editar y borrar SUS filas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'body_measurements', 'physiology_settings', 'consents', 'nutrition_preferences',
    'connections', 'import_jobs', 'import_items', 'activities', 'activity_sources',
    'activity_merges', 'activity_not_duplicates', 'activity_load', 'seasons', 'goals',
    'goal_stages', 'season_blocks', 'pauses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy own_select on public.%I for select to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_insert on public.%I for insert to authenticated
                     with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_update on public.%I for update to authenticated
                     using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy own_delete on public.%I for delete to authenticated
                     using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Datos de salud: el navegador solo lee (texto cifrado) y borra lo suyo.
alter table public.health_records enable row level security;
create policy own_select on public.health_records for select to authenticated using (user_id = (select auth.uid()));
create policy own_delete on public.health_records for delete to authenticated using (user_id = (select auth.uid()));

-- Tokens: RLS activo y sin políticas = nadie desde el navegador.
alter table public.provider_tokens enable row level security;

-- Permisos de tabla (RLS se aplica encima de estos permisos)
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.provider_tokens from authenticated;
revoke insert, update on public.health_records from authenticated;
-- El perfil lo crea el sistema al registrarse; la persona no puede borrarlo
-- (para eso está «Borrar mi cuenta», que elimina todo).
revoke insert, delete on public.profiles from authenticated;
-- La consulta de consentimiento solo la usan el servidor y los triggers: así nadie
-- puede preguntar si OTRA persona dio su consentimiento.
revoke execute on function public.has_health_consent(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- Las Edge Functions usan service_role (salta RLS, solo existe en el servidor).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Storage (solo existe en Supabase): carpetas privadas por usuario
--   activity-streams/{user_id}/…   series de datos comprimidas
--   goal-gpx/{user_id}/…           rutas GPX de las metas
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values
      ('activity-streams', 'activity-streams', false),
      ('goal-gpx', 'goal-gpx', false)
    on conflict (id) do nothing;

    execute $p$create policy "own files read" on storage.objects for select to authenticated
      using (bucket_id in ('activity-streams', 'goal-gpx') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files insert" on storage.objects for insert to authenticated
      with check (bucket_id in ('activity-streams', 'goal-gpx') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files update" on storage.objects for update to authenticated
      using (bucket_id in ('activity-streams', 'goal-gpx') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own files delete" on storage.objects for delete to authenticated
      using (bucket_id in ('activity-streams', 'goal-gpx') and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;
