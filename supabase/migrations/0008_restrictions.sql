-- ============================================================================
-- 0008_restrictions.sql — Restrictions individuelles décidées par l'administration
--
-- Jusqu'ici, la seule sanction disponible était la suspension du compte
-- (`profiles.status = 'suspended'`) : elle coupe TOUT l'accès. Un pasteur qui
-- veut simplement empêcher une personne de publier des témoignages n'avait
-- aucun moyen intermédiaire.
--
-- Cette migration ajoute des restrictions ciblées :
--   * `event_registration`  — ne peut plus s'inscrire aux événements ;
--   * `testimony_submission`— ne peut plus publier de témoignage ;
--   * `gallery_access`      — ne peut plus ouvrir la galerie des membres ;
--   * `directory_listing`   — n'apparaît plus dans l'annuaire ;
--   * `department_request`  — ne peut plus demander à rejoindre un département.
--
-- Principes :
--   1. Une restriction est une LIGNE : la lever = la supprimer. Aucune colonne
--      booléenne à inverser, historique lisible et auditable.
--   2. Le motif est conservé (`reason`) : la personne concernée peut le lire.
--   3. `created_by` garde la trace de l'administrateur qui a décidé.
--   4. Les comptes administrateurs ne peuvent pas être restreints (garde-fou
--      applicatif) : cette table ne bloque aucune fonction d'administration.
--   5. Aucune donnée existante n'est modifiée : la migration est purement
--      additive et peut être annulée en supprimant la table.
-- ============================================================================

create table if not exists public.profile_restrictions (
  profile_id uuid not null references public.profiles (id) on delete cascade,

  code text not null check (
    code in (
      'event_registration',
      'testimony_submission',
      'gallery_access',
      'directory_listing',
      'department_request'
    )
  ),

  -- Motif facultatif, affiché au membre concerné.
  reason text,

  -- Administrateur à l'origine de la décision (conservé si son compte part).
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- Une seule ligne par (membre, restriction) : l'ajout est idempotent.
  primary key (profile_id, code)
);

comment on table public.profile_restrictions is
  'Restrictions individuelles appliquées à un membre approuvé (distinctes de la suspension du compte).';

comment on column public.profile_restrictions.code is
  'Code de la restriction appliquée, contrôlé par la contrainte check.';

-- Lecture rapide de toutes les restrictions d'un profil (déjà couvert par la
-- clé primaire) et statistiques par type.
create index if not exists profile_restrictions_code_idx
  on public.profile_restrictions (code);

-- ---------------------------------------------------------------------------
-- RLS : lecture réservée aux administrateurs via PostgREST
-- ---------------------------------------------------------------------------
-- L'API se connecte avec le rôle propriétaire et n'est donc pas concernée ;
-- ces politiques protègent un éventuel accès direct (clé anon).
alter table public.profile_restrictions enable row level security;

drop policy if exists profile_restrictions_admin_read on public.profile_restrictions;
create policy profile_restrictions_admin_read on public.profile_restrictions
  for select to authenticated
  using (public.is_admin());

drop policy if exists profile_restrictions_owner_read on public.profile_restrictions;
create policy profile_restrictions_owner_read on public.profile_restrictions
  for select to authenticated
  using (profile_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.profile_restrictions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.profile_restrictions to authenticated;
  end if;
end
$$;
