-- ============================================================================
-- 0006_department_nominations.sql — Nominations et historique des responsables
--
-- Jusqu'ici, l'appartenance d'un membre a un departement etait stockee dans
-- `department_members` sans notion de periode : impossible de savoir quand une
-- fonction a commence, ni quand elle s'est terminee. Cette migration ajoute :
--
--   1. les dates d'exercice sur `department_members` (started_on / ended_on)
--      et l'intitule libre de la fonction (function_title) ;
--   2. une table d'historique `department_nominations` qui conserve chaque
--      nomination, y compris apres la fin de la fonction ou l'archivage du
--      departement (le nom du departement est recopie dans la ligne).
--
-- Aucune donnee existante n'est supprimee : les lignes actuelles recoivent
-- `started_on = current_date` par defaut et restent actives.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Periode d'exercice sur l'affectation courante
-- ---------------------------------------------------------------------------
alter table public.department_members
  add column if not exists started_on date not null default current_date;

alter table public.department_members
  add column if not exists ended_on date;

-- Intitule explicite de la fonction (« Responsable louange », « Adjoint
-- jeunesse »…). Le champ `member_role` reste la cle technique utilisee par les
-- controles d'acces.
alter table public.department_members
  add column if not exists function_title text;

alter table public.department_members
  drop constraint if exists department_members_dates_check;
alter table public.department_members
  add constraint department_members_dates_check
  check (ended_on is null or ended_on >= started_on);

-- ---------------------------------------------------------------------------
-- 2. Historique des nominations
-- ---------------------------------------------------------------------------
create table if not exists public.department_nominations (
  id uuid primary key default gen_random_uuid(),

  -- La reference est facultative : si un departement est supprime, l'historique
  -- doit rester lisible (le nom est recopie ci-dessous).
  department_id uuid references public.departments (id) on delete set null,
  department_name text not null,

  profile_id uuid not null references public.profiles (id) on delete cascade,

  member_role text not null check (member_role in ('leader', 'assistant', 'member')),
  function_title text,

  started_on date not null default current_date,
  ended_on date,
  status text not null default 'active' check (status in ('active', 'ended')),

  appointed_by uuid references public.profiles (id) on delete set null,
  ended_by uuid references public.profiles (id) on delete set null,
  end_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint department_nominations_dates_check
    check (ended_on is null or ended_on >= started_on)
);

create index if not exists department_nominations_profile_idx
  on public.department_nominations (profile_id, started_on desc);

create index if not exists department_nominations_department_idx
  on public.department_nominations (department_id, status, started_on desc);

-- Une seule nomination active par membre et par departement : evite les
-- doublons si l'operation est rejouee.
create unique index if not exists department_nominations_active_uniq
  on public.department_nominations (department_id, profile_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at_department_nominations on public.department_nominations;
create trigger set_updated_at_department_nominations
  before update on public.department_nominations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS : lecture par l'administrateur ou le responsable du departement
-- ---------------------------------------------------------------------------
alter table public.department_nominations enable row level security;

drop policy if exists department_nominations_select on public.department_nominations;
create policy department_nominations_select on public.department_nominations
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or (department_id is not null and public.is_department_leader(department_id))
  );

drop policy if exists department_nominations_write on public.department_nominations;
create policy department_nominations_write on public.department_nominations
  for insert to authenticated
  with check (public.is_admin() or (department_id is not null and public.is_department_leader(department_id)));

drop policy if exists department_nominations_update on public.department_nominations;
create policy department_nominations_update on public.department_nominations
  for update to authenticated
  using (public.is_admin() or (department_id is not null and public.is_department_leader(department_id)))
  with check (public.is_admin() or (department_id is not null and public.is_department_leader(department_id)));

-- Le role `anon` n'a aucun usage de cet historique.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.department_nominations from anon;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges pour les roles Supabase (l'API utilise un role proprietaire)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update on public.department_nominations to authenticated;
  end if;
end
$$;
