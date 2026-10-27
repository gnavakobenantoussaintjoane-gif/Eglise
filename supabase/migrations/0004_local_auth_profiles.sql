-- ============================================================================
-- 0004_local_auth_profiles.sql — Profils indépendants de Supabase Auth
--
-- L'application gère elle-même les comptes (hachage scrypt + cookie de session
-- signé, voir backend/src/modules/auth/local-provider.ts). Chaque profil est
-- donc créé avec son propre identifiant : il ne peut pas dépendre de
-- `auth.users`, qui n'est renseigné que si Supabase Auth est utilisé.
--
-- Cette migration :
--   1. supprime la clé étrangère public.profiles.id -> auth.users(id) ;
--   2. ajoute un lien facultatif `auth_user_id` pour un usage futur
--      (Supabase Auth ou mode hybride), sans jamais l'exiger ;
--   3. rattache church_settings.updated_by à public.profiles(id), qui est le
--      référentiel réel des auteurs dans cette application.
--
-- Idempotente et compatible PGlite / PostgreSQL nu / Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles : plus de dépendance obligatoire à auth.users
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_name);
    raise notice 'profiles : contrainte % supprimee (dependance auth.users).', constraint_name;
  end loop;
end
$$;

-- Identifiant Supabase Auth facultatif (rempli uniquement en mode hybride).
alter table public.profiles
  add column if not exists auth_user_id uuid;

create unique index if not exists profiles_auth_user_id_key
  on public.profiles (auth_user_id)
  where auth_user_id is not null;

-- La clé étrangère n'est posée que si le schéma auth est réellement présent
-- (Supabase), et seulement si elle n'existe pas déjà.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) and not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
  ) then
    alter table public.profiles
      add constraint profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
exception when others then
  raise notice 'profiles : lien auth_user_id non contraint (%).', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. church_settings.updated_by : rattaché aux profils de l'application
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'church_settings'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
  loop
    execute format('alter table public.church_settings drop constraint %I', constraint_name);
    raise notice 'church_settings : contrainte % supprimee (dependance auth.users).', constraint_name;
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'church_settings'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%references public.profiles%'
  ) then
    alter table public.church_settings
      add constraint church_settings_updated_by_fkey
      foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
exception when others then
  raise notice 'church_settings : contrainte updated_by non posee (%).', sqlerrm;
end
$$;

comment on column public.profiles.auth_user_id is
  'Identifiant Supabase Auth facultatif. Vide lorsque l''application utilise son propre systeme de comptes.';
