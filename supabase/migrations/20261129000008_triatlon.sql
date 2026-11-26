-- =============================================================================
-- Triatlón. Cambios solo aditivos:
--  · las metas aceptan el deporte «triathlon» (se amplía la lista; nada existente cambia)
--  · metas: distancia del catálogo (tri_preset) y tramos (legs: distancias y objetivos)
--  · disponibilidad: días con piscina
-- =============================================================================

alter table public.goals drop constraint if exists goals_sport_check;
alter table public.goals add constraint goals_sport_check
  check (sport in ('cycling', 'running', 'swimming', 'strength', 'other', 'triathlon'));

alter table public.goals add column if not exists tri_preset text
  check (tri_preset in ('super_sprint', 'sprint', 'olympic', 'im_5150', 'im_703', 'im_full', 'custom'));
-- {"swimM":1900,"bikeM":90000,"runM":21100,"swimS":2400,"bikeS":11700,"runS":7500} (objetivos opcionales)
alter table public.goals add column if not exists legs jsonb
  check (legs is null or jsonb_typeof(legs) = 'object');

alter table public.training_availability add column if not exists pool_days smallint[] not null default '{}'
  check (pool_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
