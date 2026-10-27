-- ============================================================================
-- 0003_storage.sql — Buckets et politiques de stockage Supabase
-- A executer sur un projet Supabase (le schema `storage` n'existe pas sur un
-- PostgreSQL nu : le script est donc conditionnel).
-- ============================================================================

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage absent : 0003_storage.sql ignore (PostgreSQL nu).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('media', 'media', false, 26214400, array[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
      'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
      'application/pdf'
    ]),
    ('public-assets', 'public-assets', true, 5242880, array[
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/avif'
    ])
  on conflict (id) do nothing;
end
$$;

do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'storage' and table_name = 'objects') then
    raise notice 'storage.objects absent : politiques de stockage ignorees.';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Lecture des medias prives
  -- Arborescence attendue :
  --   albums/<album_id>/<fichier>
  --   sermons/<fichier>
  --   profiles/<profile_id>/<fichier>
  --   events/<fichier>
  -- -------------------------------------------------------------------------
  drop policy if exists media_read on storage.objects;
  execute $policy$
    create policy media_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'media'
        and (
          public.is_media()
          or (
            (storage.foldername(name))[1] = 'profiles'
            and (storage.foldername(name))[2] = auth.uid()::text
          )
          or (
            (storage.foldername(name))[1] = 'albums'
            and public.can_view_album(((storage.foldername(name))[2])::uuid)
          )
          or (
            (storage.foldername(name))[1] in ('sermons', 'events')
            and public.is_approved_member()
          )
        )
      )
  $policy$;

  drop policy if exists media_write on storage.objects;
  execute $policy$
    create policy media_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('media', 'public-assets')
        and public.is_media()
      )
  $policy$;

  drop policy if exists media_update on storage.objects;
  execute $policy$
    create policy media_update on storage.objects
      for update to authenticated
      using (bucket_id in ('media', 'public-assets') and public.is_media())
      with check (bucket_id in ('media', 'public-assets') and public.is_media())
  $policy$;

  drop policy if exists media_delete on storage.objects;
  execute $policy$
    create policy media_delete on storage.objects
      for delete to authenticated
      using (bucket_id in ('media', 'public-assets') and public.is_media())
  $policy$;

  drop policy if exists public_assets_read on storage.objects;
  execute $policy$
    create policy public_assets_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'public-assets')
  $policy$;

  -- Avatar : un membre peut deposer sa propre photo de profil
  drop policy if exists profiles_avatar_write on storage.objects;
  execute $policy$
    create policy profiles_avatar_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'media'
        and (storage.foldername(name))[1] = 'profiles'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
  $policy$;
end
$$;
