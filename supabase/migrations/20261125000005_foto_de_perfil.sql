-- =============================================================================
-- Foto de perfil: bucket privado «avatars», un archivo por persona en
-- avatars/{user_id}/avatar.jpg. Solo la dueña puede verla, cambiarla o borrarla.
-- La app la recorta a 256×256 y la vuelve a codificar (sin metadatos ni GPS).
-- =============================================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
    on conflict (id) do nothing;

    execute $p$create policy "own avatar read" on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own avatar insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own avatar update" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy "own avatar delete" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;
