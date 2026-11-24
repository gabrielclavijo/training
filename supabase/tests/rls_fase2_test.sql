-- Pruebas de aislamiento de la fase 2 (plan, disponibilidad, bandeja de Strava)
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000003', 'carla@ejemplo.co'),
  ('dddddddd-0000-0000-0000-000000000004', 'dario@ejemplo.co');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003"}', true);
insert into public.training_availability (minutes_by_day, long_day) values ('{"1":0,"2":60,"3":60,"4":60,"5":0,"6":180,"7":90}', 6);
insert into public.training_plans (id, reason) values ('c0000000-0000-0000-0000-0000000000a1', 'initial');
insert into public.plan_weeks (plan_id, week_start, phase, target_load) values ('c0000000-0000-0000-0000-0000000000a1', '2026-11-23', 'base', 300);
insert into public.planned_sessions (id, plan_id, date, sport, kind, duration_min, planned_load)
values ('c0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000a1', '2026-11-24', 'cycling', 'easy', 60, 45);
insert into public.plan_changes (plan_id, reason) values ('c0000000-0000-0000-0000-0000000000a1', 'initial');
select test.fails($$insert into public.provider_inbox (user_id, provider, external_id, event)
                    values (auth.uid(), 'strava', '1', 'create')$$,
                  'el navegador no puede escribir en la bandeja de Strava (solo el servidor)');
select test.ok((select count(*) from public.planned_sessions) = 1, 'Carla ve su sesión planeada');
commit;

begin;
set local role service_role;
insert into public.provider_inbox (user_id, provider, external_id, event, payload)
values ('cccccccc-0000-0000-0000-000000000003', 'strava', '999', 'create', '{"x":1}');
select test.ok(true, 'el servidor (webhook) puede escribir en la bandeja');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004"}', true);
select test.ok((select count(*) from public.training_availability) = 0, 'Darío no ve la disponibilidad de Carla');
select test.ok((select count(*) from public.training_plans) = 0, 'Darío no ve planes ajenos');
select test.ok((select count(*) from public.plan_weeks) = 0, 'Darío no ve semanas ajenas');
select test.ok((select count(*) from public.planned_sessions) = 0, 'Darío no ve sesiones ajenas');
select test.ok((select count(*) from public.plan_changes) = 0, 'Darío no ve cambios de plan ajenos');
select test.ok((select count(*) from public.provider_inbox) = 0, 'Darío no ve la bandeja de Strava de Carla');
select test.fails($$insert into public.planned_sessions (plan_id, date, sport, kind, duration_min)
                    values ('c0000000-0000-0000-0000-0000000000a1', '2026-11-25', 'running', 'easy', 30)$$,
                  'Darío no puede colgar sesiones del plan de Carla');
select test.fails($$insert into public.activities (sport, start_time, elapsed_s, planned_session_id)
                    values ('cycling', now(), 60, 'c0000000-0000-0000-0000-0000000000b1')$$,
                  'Darío no puede enlazar su actividad a una sesión de Carla');
with d as (delete from public.provider_inbox returning 1)
select test.ok((select count(*) from d) = 0, 'Darío no puede vaciar la bandeja de Carla');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003"}', true);
select test.ok((select count(*) from public.provider_inbox) = 1, 'Carla ve su bandeja de Strava');
with d as (delete from public.provider_inbox returning 1)
select test.ok((select count(*) from d) = 1, 'Carla puede vaciar su bandeja tras procesarla');
commit;

-- Purga de 7 días: también la bandeja
insert into public.provider_inbox (user_id, provider, external_id, event, expires_at)
values ('cccccccc-0000-0000-0000-000000000003', 'strava', '5', 'create', now() - interval '1 day');
select public.purge_expired_provider_data();
select test.ok((select count(*) from public.provider_inbox where external_id = '5') = 0, 'la bandeja de Strava se borra a los 7 días');

delete from auth.users where id = 'cccccccc-0000-0000-0000-000000000003';
select test.ok((select count(*) from public.planned_sessions where user_id = 'cccccccc-0000-0000-0000-000000000003') = 0
  and (select count(*) from public.training_plans where user_id = 'cccccccc-0000-0000-0000-000000000003') = 0,
  'al borrar la cuenta se borra también el plan');

\echo 'Pruebas de RLS de la fase 2: todas pasaron.'
