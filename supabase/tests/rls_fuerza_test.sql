-- Pruebas de «Tu fuerza»
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('a7a7a7a7-0000-0000-0000-000000000021', 'lina@ejemplo.co'),
  ('b8b8b8b8-0000-0000-0000-000000000022', 'pedro@ejemplo.co');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000021"}', true);
insert into public.strength_prefs (location, equipment, dumbbell_max_kg, discomfort) values ('home', '{dumbbells,bands}', 10, '{knee}');
select test.ok((select enabled from public.strength_prefs), 'la fuerza viene activada por defecto');
insert into public.strength_prefs (enabled, location) values (false, 'gym')
  on conflict (user_id) do update set enabled = excluded.enabled, location = excluded.location;
select test.ok((select location from public.strength_prefs) = 'gym', 'Lina puede cambiar sus preferencias');
select test.fails($$update public.strength_prefs set equipment = '{piano}'$$, 'solo equipo de la lista');
select test.fails($$update public.strength_prefs set discomfort = '{codo}'$$, 'solo molestias de la lista');
select test.fails($$update public.strength_prefs set location = 'parque'$$, 'solo lugares de la lista');
select test.fails($$update public.strength_prefs set dumbbell_max_kg = 500$$, 'peso de mancuernas razonable');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b8b8b8b8-0000-0000-0000-000000000022"}', true);
select test.ok((select count(*) from public.strength_prefs) = 0, 'Pedro no ve las preferencias de Lina');
select test.fails($$insert into public.strength_prefs (user_id) values ('a7a7a7a7-0000-0000-0000-000000000021')$$, 'Pedro no puede escribir a nombre de Lina');
with d as (update public.strength_prefs set enabled = true returning 1)
select test.ok((select count(*) from d) = 0, 'Pedro no puede cambiar preferencias ajenas');
commit;

delete from auth.users where id = 'a7a7a7a7-0000-0000-0000-000000000021';
select test.ok((select count(*) from public.strength_prefs where user_id = 'a7a7a7a7-0000-0000-0000-000000000021') = 0,
  'al borrar la cuenta se borran sus preferencias');

\echo 'Pruebas de «Tu fuerza»: todas pasaron.'
