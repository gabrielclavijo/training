-- Pruebas de «¿Cómo te sientes hoy?»
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('c3c3c3c3-0000-0000-0000-000000000009', 'ines@ejemplo.co'),
  ('d4d4d4d4-0000-0000-0000-000000000010', 'juan@ejemplo.co');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000009"}', true);
insert into public.daily_checkins (day, feeling, tags) values (current_date, 4, '{energized}');
insert into public.daily_checkins (day, feeling, tags) values (current_date, 2, '{tired_legs,slept_bad}')
  on conflict (user_id, day) do update set feeling = excluded.feeling, tags = excluded.tags;
select test.ok((select feeling from public.daily_checkins) = 2, 'Inés puede cambiar su registro del día');
select test.fails($$insert into public.daily_checkins (day, feeling) values (current_date - 1, 9)$$, 'el valor debe estar entre 1 y 5');
select test.fails($$insert into public.daily_checkins (day, feeling, tags) values (current_date - 1, 3, '{inventada}')$$, 'solo etiquetas de la lista');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-000000000010"}', true);
select test.ok((select count(*) from public.daily_checkins) = 0, 'Juan no ve los registros de Inés');
select test.fails($$insert into public.daily_checkins (user_id, day, feeling) values ('c3c3c3c3-0000-0000-0000-000000000009', current_date - 2, 3)$$,
  'Juan no puede escribir a nombre de Inés');
with d as (update public.daily_checkins set feeling = 5 returning 1)
select test.ok((select count(*) from d) = 0, 'Juan no puede cambiar registros ajenos');
commit;

delete from auth.users where id = 'c3c3c3c3-0000-0000-0000-000000000009';
select test.ok((select count(*) from public.daily_checkins where user_id = 'c3c3c3c3-0000-0000-0000-000000000009') = 0,
  'al borrar la cuenta se borran sus registros');

\echo 'Pruebas de «¿Cómo te sientes hoy?»: todas pasaron.'
