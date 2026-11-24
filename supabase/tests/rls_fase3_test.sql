-- Pruebas de aislamiento de la fase 3 (alimentación, menús, uso de IA, recomendaciones)
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'elena@ejemplo.co'),
  ('ffffffff-0000-0000-0000-000000000006', 'felipe@ejemplo.co');

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005"}', true);
insert into public.nutrition_preferences (diet_type, goal, food_allergies, meals_per_day, cooking_minutes, budget, pantry)
values ('vegetarian', 'perform', '{maní}', 5, 30, 'low', '{arroz,lentejas}');
insert into public.recommendation_state (rule_key, reaction, dismissed_until) values ('very_tired', 'ok', '2026-12-01');
select test.fails($$insert into public.meal_plans (user_id, week_start, inputs, menu, model)
                    values (auth.uid(), '2026-11-23', '{}', '{}', 'x')$$,
                  'el navegador no puede escribir menús (solo la función de IA)');
select test.fails($$insert into public.ai_usage (user_id, kind) values (auth.uid(), 'menu')$$,
                  'el navegador no puede escribir su registro de uso de IA');
select test.fails($$update public.nutrition_preferences set meals_per_day = 9$$,
                  'comidas por día fuera de rango se rechaza');
commit;

begin;
set local role service_role;
insert into public.meal_plans (user_id, week_start, inputs, menu, model)
values ('eeeeeeee-0000-0000-0000-000000000005', '2026-11-23', '{"days":[]}', '{"days":[]}', 'claude-opus-5-5');
insert into public.ai_usage (user_id, kind) values ('eeeeeeee-0000-0000-0000-000000000005', 'menu');
select test.ok(true, 'la función de IA (servidor) puede guardar menús y uso');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000006"}', true);
select test.ok((select count(*) from public.nutrition_preferences) = 0, 'Felipe no ve la alimentación de Elena');
select test.ok((select count(*) from public.meal_plans) = 0, 'Felipe no ve menús ajenos');
select test.ok((select count(*) from public.ai_usage) = 0, 'Felipe no ve el uso de IA ajeno');
select test.ok((select count(*) from public.recommendation_state) = 0, 'Felipe no ve recomendaciones ajenas');
with d as (delete from public.meal_plans returning 1)
select test.ok((select count(*) from d) = 0, 'Felipe no puede borrar menús ajenos');
select test.fails($$insert into public.recommendation_state (user_id, rule_key, reaction, dismissed_until)
                    values ('eeeeeeee-0000-0000-0000-000000000005', 'x', 'ok', '2026-12-01')$$,
                  'Felipe no puede escribir recomendaciones a nombre de Elena');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005"}', true);
select test.ok((select count(*) from public.meal_plans) = 1, 'Elena ve su menú');
select test.fails($$delete from public.ai_usage$$, 'Elena no puede borrar su registro de uso (el límite se mantiene)');
with d as (delete from public.meal_plans returning 1)
select test.ok((select count(*) from d) = 1, 'Elena puede borrar su menú');
commit;

delete from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000005';
select test.ok((select count(*) from public.ai_usage where user_id = 'eeeeeeee-0000-0000-0000-000000000005') = 0
  and (select count(*) from public.recommendation_state where user_id = 'eeeeeeee-0000-0000-0000-000000000005') = 0,
  'al borrar la cuenta se borran el uso de IA y las recomendaciones');

\echo 'Pruebas de RLS de la fase 3: todas pasaron.'
