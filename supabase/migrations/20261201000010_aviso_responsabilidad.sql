-- =============================================================================
-- Aviso de responsabilidad: cada persona acepta, una vez, que Entreno solo
-- orienta y que no la exime de consultar a profesionales. Se guarda como un
-- consentimiento más (tipo «disclaimer», con su versión y fecha).
-- Cambio solo aditivo: amplía los tipos permitidos; no toca ningún dato.
-- =============================================================================

alter table public.consents drop constraint if exists consents_consent_type_check;
alter table public.consents add constraint consents_consent_type_check
  check (consent_type in ('privacy_policy', 'health_data', 'disclaimer'));
