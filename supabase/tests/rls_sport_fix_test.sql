-- Corrección del deporte (actividades guardadas como «gimnasio» con desplazamiento)
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values ('e5e5e5e5-0000-0000-0000-000000000011', 'luz@ejemplo.co');
insert into public.activities (id, user_id, start_time, sport, elapsed_s, moving_s, distance_m, has_gps) values
  ('a1000000-0000-0000-0000-000000000001', 'e5e5e5e5-0000-0000-0000-000000000011', now() - interval '3 days', 'strength', 32280, 5580, 103000, true),
  ('a1000000-0000-0000-0000-000000000002', 'e5e5e5e5-0000-0000-0000-000000000011', now() - interval '2 days', 'other', 3300, 3300, 10000, true),
  ('a1000000-0000-0000-0000-000000000003', 'e5e5e5e5-0000-0000-0000-000000000011', now() - interval '1 days', 'strength', 3600, 3600, null, false);

select test.ok(public.fix_activity_sports() = 2, 'corrige 2 actividades');
select test.ok((select sport from public.activities where id = 'a1000000-0000-0000-0000-000000000001') = 'cycling', '103 km como «gimnasio» → ciclismo');
select test.ok((select sport from public.activities where id = 'a1000000-0000-0000-0000-000000000002') = 'running', '10 km a trote → running');
select test.ok((select sport from public.activities where id = 'a1000000-0000-0000-0000-000000000003') = 'strength', 'gimnasio sin distancia no se toca');
select test.ok((select old_sport from public.activity_sport_fixes where activity_id = 'a1000000-0000-0000-0000-000000000001') = 'strength', 'el valor anterior queda guardado');
select test.ok(public.fix_activity_sports() = 0, 'volver a ejecutarla no cambia nada');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-000000000010"}', true);
select test.ok((select count(*) from public.activity_sport_fixes) = 0, 'otra persona no ve las correcciones ajenas');
select test.fails($$select public.fix_activity_sports()$$, 'una persona no puede ejecutar la corrección');
commit;

\echo 'Pruebas de la corrección de deporte: todas pasaron.'
