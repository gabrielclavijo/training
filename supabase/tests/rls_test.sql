-- =============================================================================
-- Pruebas de aislamiento entre usuarios (Row Level Security)
-- Criterio de aceptación: «Un usuario no puede ver datos de otro, ni siquiera
-- manipulando la URL o las consultas».
-- Se ejecuta con scripts/test-db.sh. Cualquier fallo detiene el script.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on

create schema if not exists test;
grant usage on schema test to authenticated, anon, service_role;

create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on function test.ok(boolean, text) to authenticated, anon, service_role;

-- Ejecuta un SQL y confirma que falla (por permisos, RLS o llave foránea).
create or replace function test.fails(sql text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (rechazado: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ: % (la operación se permitió)', msg;
end $$;
grant execute on function test.fails(text, text) to authenticated, anon, service_role;

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''

-- Registro de dos personas (lo hace Supabase Auth)
insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'ana@ejemplo.co', '{"full_name":"Ana"}'),
  (:B, 'beto@ejemplo.co', '{}');

select test.ok((select count(*) from public.profiles) = 2, 'al registrarse se crea el perfil');
select test.ok((select count(*) from public.connections where user_id = :A) = 4, 'al registrarse se crean las conexiones');
select test.ok((select display_name from public.profiles where user_id = :A) = 'Ana', 'toma el nombre de Google');

-- ---------------------------------------------------------------------------
-- Ana crea sus datos
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);

insert into public.goals (id, name, sport, event_date, goal_type, objective, target_time_s)
values ('a0000000-0000-0000-0000-00000000000a', 'Vuelta de 3 días', 'cycling', '2027-05-09', 'stage', 'time', 54000);
insert into public.goal_stages (goal_id, stage_number, distance_m, elevation_gain_m)
values ('a0000000-0000-0000-0000-00000000000a', 1, 95000, 1800);
insert into public.activities (id, sport, start_time, elapsed_s, distance_m)
values ('a0000000-0000-0000-0000-0000000000ac', 'cycling', '2026-11-20T11:00:00Z', 7200, 60000);
insert into public.activity_sources (id, activity_id, provider, source_format, sport, start_time, elapsed_s, file_sha256)
values ('a0000000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-0000000000ac', 'file', 'fit', 'cycling',
        '2026-11-20T11:00:00Z', 7200, 'hash-ana-1');
update public.activities set primary_source_id = 'a0000000-0000-0000-0000-0000000000a5'
  where id = 'a0000000-0000-0000-0000-0000000000ac';
insert into public.body_measurements (measured_on, weight_kg) values ('2026-11-20', 68.5);
insert into public.consents (consent_type, policy_version) values ('health_data', '1');
update public.profiles set birth_date = '1990-05-01' where user_id = auth.uid();

select test.ok((select count(*) from public.goals) = 1, 'Ana ve su meta');
select test.fails($$insert into public.health_records (user_id, category, ciphertext, iv)
                    values (auth.uid(), 'medication', 'x', 'y')$$,
                  'el navegador no puede escribir datos de salud sin pasar por el cifrado');
select test.fails($$select * from public.provider_tokens$$, 'el navegador no puede leer tokens de proveedores');
select test.fails($$insert into public.profiles (user_id) values (gen_random_uuid())$$, 'no se pueden crear perfiles a mano');
commit;

-- ---------------------------------------------------------------------------
-- Beto intenta ver y tocar lo de Ana
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', true);

select test.ok((select count(*) from public.goals) = 0, 'Beto no ve metas ajenas');
select test.ok((select count(*) from public.goals where id = 'a0000000-0000-0000-0000-00000000000a') = 0,
               'Beto no ve la meta de Ana ni pidiéndola por su id (URL manipulada)');
select test.ok((select count(*) from public.goal_stages) = 0, 'Beto no ve etapas ajenas');
select test.ok((select count(*) from public.activities) = 0, 'Beto no ve actividades ajenas');
select test.ok((select count(*) from public.activity_sources) = 0, 'Beto no ve fuentes ajenas');
select test.ok((select count(*) from public.body_measurements) = 0, 'Beto no ve el peso de Ana');
select test.ok((select count(*) from public.consents) = 0, 'Beto no ve consentimientos ajenos');
select test.ok((select count(*) from public.profiles) = 1, 'Beto solo ve su propio perfil');
select test.ok((select count(*) from public.connections) = 4, 'Beto solo ve sus conexiones');
select test.fails($$select public.has_health_consent('aaaaaaaa-0000-0000-0000-000000000001')$$,
                  'Beto no puede averiguar si Ana dio consentimiento de salud');

with u as (update public.goals set name = 'hackeado' where id = 'a0000000-0000-0000-0000-00000000000a' returning 1)
select test.ok((select count(*) from u) = 0, 'Beto no puede editar la meta de Ana');
with d as (delete from public.activities where id = 'a0000000-0000-0000-0000-0000000000ac' returning 1)
select test.ok((select count(*) from d) = 0, 'Beto no puede borrar la actividad de Ana');
with u as (update public.profiles set display_name = 'x' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select test.ok((select count(*) from u) = 0, 'Beto no puede editar el perfil de Ana');

select test.fails($$insert into public.goals (user_id, name, sport, event_date)
                    values ('aaaaaaaa-0000-0000-0000-000000000001', 'intruso', 'running', '2027-01-01')$$,
                  'Beto no puede crear filas a nombre de Ana');
select test.fails($$insert into public.goal_stages (goal_id, stage_number, distance_m)
                    values ('a0000000-0000-0000-0000-00000000000a', 2, 1000)$$,
                  'Beto no puede colgar una etapa suya de la meta de Ana');
select test.fails($$insert into public.activity_sources (activity_id, provider, source_format, sport, start_time, elapsed_s)
                    values ('a0000000-0000-0000-0000-0000000000ac', 'file', 'gpx', 'cycling', now(), 60)$$,
                  'Beto no puede fusionar un archivo suyo con la actividad de Ana');
select test.fails($$update public.profiles set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                    where user_id = auth.uid()$$,
                  'Beto no puede cambiarse el user_id');
select test.fails($$insert into public.consents (user_id, consent_type, policy_version)
                    values ('aaaaaaaa-0000-0000-0000-000000000001', 'health_data', '1')$$,
                  'Beto no puede dar consentimientos por Ana');

-- Beto sube el mismo archivo que Ana: no choca con el de ella (el hash es único por persona)
insert into public.activities (id, sport, start_time, elapsed_s)
values ('b0000000-0000-0000-0000-0000000000ac', 'cycling', '2026-11-20T11:00:00Z', 7200);
insert into public.activity_sources (activity_id, provider, source_format, sport, start_time, elapsed_s, file_sha256)
values ('b0000000-0000-0000-0000-0000000000ac', 'file', 'fit', 'cycling', '2026-11-20T11:00:00Z', 7200, 'hash-ana-1');
select test.ok(true, 'el mismo archivo puede existir en cuentas distintas');
commit;

-- ---------------------------------------------------------------------------
-- Sin sesión (anon) no se ve nada
-- ---------------------------------------------------------------------------
begin;
set local role anon;
select test.fails($$select * from public.goals$$, 'sin sesión no se puede leer ninguna tabla');
select test.fails($$select * from public.profiles$$, 'sin sesión no se pueden leer perfiles');
commit;

-- ---------------------------------------------------------------------------
-- Datos de salud: solo con consentimiento (lo escribe la Edge Function)
-- ---------------------------------------------------------------------------
begin;
set local role service_role;
insert into public.health_records (user_id, category, ciphertext, iv)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'medication', 'cifrado', 'iv');
select test.ok(true, 'con consentimiento se guarda el dato de salud cifrado');
select test.fails($$insert into public.health_records (user_id, category, ciphertext, iv)
                    values ('bbbbbbbb-0000-0000-0000-000000000002', 'medication', 'cifrado', 'iv')$$,
                  'sin consentimiento no se guarda ningún dato de salud');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', true);
select test.ok((select count(*) from public.health_records) = 0, 'Beto no ve datos de salud de Ana');
commit;

-- ---------------------------------------------------------------------------
-- Reglas de Strava modeladas: caché de 7 días, nunca para IA
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', true);
select test.fails($$insert into public.activity_sources (activity_id, provider, source_format, sport, start_time,
                      elapsed_s, retention_class, ai_allowed)
                    values ('a0000000-0000-0000-0000-0000000000ac', 'strava', 'strava_api', 'cycling', now(), 60,
                      'strava_cache', true)$$,
                  'un dato de Strava no puede quedar marcado como permitido para IA');
commit;

-- ---------------------------------------------------------------------------
-- Borrar la cuenta borra todo su contenido
-- ---------------------------------------------------------------------------
delete from auth.users where id = :A;
select test.ok(
  (select count(*) from public.goals where user_id = :A) = 0
  and (select count(*) from public.goal_stages where user_id = :A) = 0
  and (select count(*) from public.activities where user_id = :A) = 0
  and (select count(*) from public.activity_sources where user_id = :A) = 0
  and (select count(*) from public.health_records where user_id = :A) = 0
  and (select count(*) from public.profiles where user_id = :A) = 0,
  'al borrar la cuenta no queda ningún dato de esa persona');
select test.ok((select count(*) from public.activities where user_id = :B) = 1, 'los datos de Beto siguen intactos');

\echo 'Todas las pruebas de RLS pasaron.'
