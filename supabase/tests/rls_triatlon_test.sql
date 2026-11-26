-- Metas de triatlón y días con piscina
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values ('f6f6f6f6-0000-0000-0000-000000000012', 'tri@ejemplo.co');
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6f6f6f6-0000-0000-0000-000000000012"}', true);
insert into public.goals (name, sport, event_date, objective, target_time_s, distance_m, tri_preset, legs)
values ('IRONMAN 70.3 Cartagena', 'triathlon', '2026-12-07', 'time', 21600, 113000, 'im_703',
        '{"swimM":1900,"bikeM":90000,"runM":21100}');
select test.ok((select legs->>'bikeM' from public.goals where name like 'IRONMAN%') = '90000', 'se guarda una meta de triatlón con sus tramos');
select test.fails($$insert into public.goals (name, sport, event_date, tri_preset) values ('x', 'triathlon', '2026-12-07', 'ultra')$$, 'solo distancias del catálogo');
select test.fails($$insert into public.goals (name, sport, event_date, legs) values ('x', 'triathlon', '2026-12-07', '[1,2]')$$, 'los tramos deben ser un objeto');
insert into public.training_availability (pool_days) values ('{1,3,5}');
select test.ok((select pool_days from public.training_availability) = '{1,3,5}', 'se guardan los días con piscina');
select test.fails($$update public.training_availability set pool_days = '{8}'$$, 'días de piscina entre lunes y domingo');
commit;
select test.ok((select count(*) from public.goals where sport = 'cycling' and tri_preset is not null) = 0, 'las metas existentes no cambian');
\echo 'Pruebas de triatlón: todas pasaron.'
