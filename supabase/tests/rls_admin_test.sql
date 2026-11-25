-- Pruebas del panel de administración: uso diario, costo de IA, recargas
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000007', 'gina@ejemplo.co'),
  ('b2b2b2b2-0000-0000-0000-000000000008', 'hugo@ejemplo.co');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000007"}', true);
select public.track_usage(60, true);
select test.ok((select seconds from public.usage_daily) = 0 and (select visits from public.usage_daily) = 1,
  'la primera señal del día abre la visita sin sumar minutos');
-- Simula que la última señal fue hace 45 s
commit;
update public.usage_daily set last_seen_at = now() - interval '45 seconds' where user_id = 'a1a1a1a1-0000-0000-0000-000000000007';

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000007"}', true);
select public.track_usage(60);
select test.ok((select seconds from public.usage_daily) between 44 and 46, 'suma solo el tiempo real transcurrido (no los 60 s pedidos)');
select public.track_usage(60);
select public.track_usage(60);
select test.ok((select seconds from public.usage_daily) between 44 and 47, 'llamarla muchas veces seguidas no infla los minutos');
select test.fails($$insert into public.usage_daily (user_id, day, seconds) values (auth.uid(), current_date - 1, 9999)$$,
  'el navegador no puede escribir minutos directamente');
select test.fails($$update public.usage_daily set seconds = 9999$$, 'el navegador no puede cambiar sus minutos');
select test.fails($$select * from public.admin_topups$$, 'el navegador no ve las recargas de saldo');
select test.fails($$insert into public.admin_settings (key, value) values ('x', '1')$$, 'el navegador no cambia los ajustes del panel');
select test.fails($$update public.ai_usage set cost_usd = 0$$, 'el navegador no cambia el costo registrado de la IA');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2b2b2b2-0000-0000-0000-000000000008"}', true);
select test.ok((select count(*) from public.usage_daily) = 0, 'Hugo no ve el uso de Gina');
select public.track_usage(30, true);
select test.ok((select count(*) from public.usage_daily) = 1, 'Hugo solo ve su propio uso');
commit;

begin;
set local role anon;
select test.fails($$select public.track_usage(60)$$, 'sin sesión no se puede registrar uso');
commit;

begin;
set local role service_role;
insert into public.admin_topups (amount_usd, note) values (5, 'Primera recarga');
insert into public.ai_usage (user_id, kind, model, input_tokens, output_tokens, cost_usd)
values ('a1a1a1a1-0000-0000-0000-000000000007', 'menu', 'claude-opus-5-5', 3000, 8000, 0.172);
select test.ok((select sum(amount_usd) from public.admin_topups) = 5 and (select sum(cost_usd) from public.ai_usage) = 0.172,
  'el servidor (panel) registra recargas y costos');
commit;

-- Borrado a los 12 meses
insert into public.usage_daily (user_id, day, seconds) values ('a1a1a1a1-0000-0000-0000-000000000007', current_date - 400, 600);
select public.purge_old_usage();
select test.ok((select count(*) from public.usage_daily where day < current_date - 365) = 0, 'el uso de más de 12 meses se borra');

delete from auth.users where id = 'a1a1a1a1-0000-0000-0000-000000000007';
select test.ok((select count(*) from public.usage_daily where user_id = 'a1a1a1a1-0000-0000-0000-000000000007') = 0,
  'al borrar la cuenta se borra su uso');

\echo 'Pruebas del panel de administración: todas pasaron.'
