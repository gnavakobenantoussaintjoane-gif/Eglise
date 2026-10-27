-- ============================================================================
-- 0001_init.sql — Schema de base de La Forteresse de l'Eternel
-- Compatible Supabase (PostgreSQL 15+) et PostgreSQL standard.
-- ============================================================================

-- pgcrypto est optionnel : gen_random_uuid() est natif depuis PostgreSQL 13.
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto indisponible, gen_random_uuid() natif utilise.';
end
$$;

-- ---------------------------------------------------------------------------
-- Types enumeres
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum (
      'profile_incomplete',
      'pending_review',
      'approved',
      'rejected',
      'suspended'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'member',
      'department_leader',
      'media',
      'admin'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'album_access_level') then
    create type public.album_access_level as enum ('public', 'members', 'restricted');
  end if;

  if not exists (select 1 from pg_type where typname = 'album_status') then
    create type public.album_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'prayer_status') then
    create type public.prayer_status as enum ('new', 'in_prayer', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'testimony_status') then
    create type public.testimony_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_kind') then
    create type public.media_kind as enum ('image', 'audio', 'document');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parametres de l'eglise (ligne unique id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.church_settings (
  id smallint primary key default 1 check (id = 1),
  church_name text not null default 'La Forteresse de l''Éternel',
  slogan text not null default 'Un refuge, une famille, une mission',
  tagline text,
  about text,
  vision text,
  mission text,
  address text,
  city text,
  country text default 'Côte d''Ivoire',
  phone text,
  whatsapp text,
  email text,
  social_links jsonb not null default '{}'::jsonb,
  service_times jsonb not null default '[]'::jsonb,
  logo_path text,
  hero_image_path text,
  color_primary text not null default '#4C1D95',
  color_royal text not null default '#6D28D9',
  color_accent text not null default '#7C3AED',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.church_settings (id, church_name)
values (1, 'La Forteresse de l''Éternel')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Departements (crees avant les profils pour la reference d'interet)
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  mission text,
  image_path text,
  leader_id uuid,
  meeting_day text,
  meeting_time text,
  meeting_location text,
  contact text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_active_idx on public.departments (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Profils (1 pour 1 avec auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  photo_path text,
  phone text,
  city text,
  profession text,
  department_interest_id uuid references public.departments (id) on delete set null,
  bio text,
  status public.member_status not null default 'profile_incomplete',
  role public.app_role not null default 'member',
  consent_photos boolean not null default false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  decision_note text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments
  drop constraint if exists departments_leader_id_fkey;
alter table public.departments
  add constraint departments_leader_id_fkey
  foreign key (leader_id) references public.profiles (id) on delete set null;

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_name_idx on public.profiles (lower(first_name), lower(last_name));

-- Historique des decisions d'adhesion
create table if not exists public.membership_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.member_status not null,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists membership_history_profile_idx
  on public.membership_history (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Deja membres d'un departement / demandes
-- ---------------------------------------------------------------------------
create table if not exists public.department_members (
  department_id uuid not null references public.departments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('leader', 'assistant', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  primary key (department_id, profile_id)
);

create table if not exists public.department_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  status public.request_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists department_requests_pending_uniq
  on public.department_requests (department_id, profile_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Galerie : albums, photos, droits restreints, demandes de retrait
-- ---------------------------------------------------------------------------
create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  category text,
  event_date date,
  access public.album_access_level not null default 'members',
  status public.album_status not null default 'draft',
  cover_photo_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists albums_visibility_idx on public.albums (status, access, event_date desc);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  caption text,
  taken_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists photos_album_idx on public.photos (album_id, sort_order);

alter table public.albums
  drop constraint if exists albums_cover_photo_id_fkey;
alter table public.albums
  add constraint albums_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- Acces nominatifs aux albums « restricted »
create table if not exists public.album_access (
  album_id uuid not null references public.albums (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (album_id, profile_id)
);

-- Procedure de consentement / retrait des photos
create table if not exists public.photo_takedown_requests (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references public.photos (id) on delete set null,
  album_id uuid references public.albums (id) on delete set null,
  requester_name text not null,
  requester_email text not null,
  reason text not null,
  status public.request_status not null default 'pending',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Predications
-- ---------------------------------------------------------------------------
create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  speaker text not null,
  series text,
  scripture text,
  summary text,
  preached_on date not null default current_date,
  audio_path text,
  video_url text,
  document_path text,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sermons_date_idx on public.sermons (is_published, preached_on desc);

-- ---------------------------------------------------------------------------
-- Evenements et inscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  category text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  registration_open boolean not null default false,
  cover_path text,
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_dates_check check (ends_at is null or ends_at >= starts_at)
);

create index if not exists events_start_idx on public.events (is_published, starts_at);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  seats integer not null default 1 check (seats between 1 and 20),
  note text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'waitlist')),
  created_at timestamptz not null default now()
);

create index if not exists event_registrations_event_idx
  on public.event_registrations (event_id, created_at);

-- ---------------------------------------------------------------------------
-- Annonces, priere, temoignages
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'public' check (audience in ('public', 'members')),
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_publish_idx
  on public.announcements (audience, is_pinned desc, published_at desc);

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  category text,
  message text not null,
  is_anonymous boolean not null default false,
  is_private boolean not null default true,
  status public.prayer_status not null default 'new',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prayer_requests_status_idx
  on public.prayer_requests (status, created_at desc);

create table if not exists public.testimonies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  title text not null,
  body text not null,
  status public.testimony_status not null default 'pending',
  is_public boolean not null default true,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists testimonies_public_idx
  on public.testimonies (status, is_public, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications internes
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_inbox_idx
  on public.notifications (profile_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Finances internes (contributions / depenses, sans paiement en ligne)
-- ---------------------------------------------------------------------------
create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  donor_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'XOF',
  method text not null default 'especes' check (method in ('especes', 'mobile_money', 'virement', 'cheque', 'autre')),
  category text not null default 'offrande' check (category in ('dime', 'offrande', 'don', 'projet', 'autre')),
  received_on date not null default current_date,
  note text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contributions_date_idx on public.contributions (received_on desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'XOF',
  category text not null default 'fonctionnement',
  spent_on date not null default current_date,
  note text,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (spent_on desc);

-- ---------------------------------------------------------------------------
-- Reinitialisation de mot de passe (mode local uniquement)
-- ---------------------------------------------------------------------------
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'church_settings', 'departments', 'profiles', 'albums', 'sermons',
    'events', 'announcements'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || t, t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'set_updated_at_' || t,
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Garde-fou : un membre ne peut pas modifier son statut ni son role
-- (defense en profondeur, s'applique meme si une faille applicative existe)
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  -- Appels serveur (service_role, pas de jeton utilisateur) : autorises.
  if caller is null then
    return new;
  end if;

  if caller = new.id and not public.is_admin() then
    if new.status is distinct from old.status then
      raise exception 'Un membre ne peut pas modifier son propre statut.';
    end if;
    if new.role is distinct from old.role then
      raise exception 'Un membre ne peut pas modifier son propre role.';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Un membre ne peut pas modifier la revue de sa demande.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();
