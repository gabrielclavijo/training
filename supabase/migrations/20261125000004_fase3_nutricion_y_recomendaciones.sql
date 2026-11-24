-- =============================================================================
-- Fase 3: alimentación (perfil, menús hechos por IA), recomendaciones por reglas.
-- Los exámenes de laboratorio usan la tabla cifrada health_records (fase 1).
-- Mismas convenciones: user_id + RLS en todo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Perfil de alimentación: lo escribe la persona a mano. Es lo ÚNICO (junto con
-- las calorías y macronutrientes calculados) que la función de menús envía a la IA.
-- ---------------------------------------------------------------------------
alter table public.nutrition_preferences
  add column goal            text not null default 'perform' check (goal in ('maintain', 'lose', 'gain', 'perform')),
  add column food_allergies  text[] not null default '{}',
  add column meals_per_day   smallint not null default 4 check (meals_per_day between 3 and 6),
  add column cooking_minutes smallint not null default 30 check (cooking_minutes between 5 and 180),
  add column budget          text not null default 'medium' check (budget in ('low', 'medium', 'high')),
  add column pantry          text[] not null default '{}',
  add constraint nutrition_lists_size check (
    cardinality(excluded_foods) <= 30 and cardinality(food_allergies) <= 30 and cardinality(pantry) <= 40
  );

-- ---------------------------------------------------------------------------
-- Menús: los escribe SOLO la Edge Function nutrition-menu (service_role).
-- La persona puede leerlos y borrarlos.
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  -- Exactamente lo que se envió a la IA (para que la persona lo pueda revisar)
  inputs     jsonb not null,
  menu       jsonb not null,
  model      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index on public.meal_plans (user_id, week_start desc);
create trigger t_meal_plans_updated before update on public.meal_plans for each row execute function public.set_updated_at();

-- Registro de uso de la IA (para el límite diario). Solo la función escribe.
create table public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('menu', 'swap')),
  created_at timestamptz not null default now()
);
create index on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Recomendaciones: qué tarjetas ocultó la persona y hasta cuándo.
-- ---------------------------------------------------------------------------
create table public.recommendation_state (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_key        text not null check (char_length(rule_key) between 1 and 60),
  reaction        text not null check (reaction in ('ok', 'not_applicable')),
  dismissed_until date not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, rule_key)
);
create trigger t_recommendation_state_updated before update on public.recommendation_state for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.meal_plans enable row level security;
alter table public.ai_usage enable row level security;
alter table public.recommendation_state enable row level security;

create policy own_select on public.meal_plans for select to authenticated using (user_id = (select auth.uid()));
create policy own_delete on public.meal_plans for delete to authenticated using (user_id = (select auth.uid()));
create policy own_select on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

create policy own_select on public.recommendation_state for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.recommendation_state for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.recommendation_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_delete on public.recommendation_state for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.meal_plans to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.recommendation_state to authenticated;
grant all on public.meal_plans, public.ai_usage, public.recommendation_state to service_role;
