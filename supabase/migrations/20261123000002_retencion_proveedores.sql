-- Borra los datos de proveedores con caché limitada (Strava: 7 días).
-- Hoy no hay datos así (la conexión con Strava está apagada); queda listo para
-- cuando se active. Programarlo con pg_cron (Supabase → Database → Cron):
--   select cron.schedule('purge-provider-cache', '17 * * * *', 'select public.purge_expired_provider_data()');
create or replace function public.purge_expired_provider_data()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with gone as (
    delete from public.activity_sources
    where retention_class = 'strava_cache' and streams_expire_at < now()
    returning activity_id
  )
  -- Actividades que se quedaron sin ninguna fuente también se borran
  delete from public.activities a
  using (select distinct activity_id from gone) g
  where a.id = g.activity_id
    and not exists (select 1 from public.activity_sources s where s.activity_id = a.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_provider_data() from public, anon, authenticated;
