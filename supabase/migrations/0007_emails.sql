-- ============================================================================
-- 0007_emails.sql — Messagerie e-mail : file d'envoi, campagnes, preferences
--
-- L'application doit pouvoir prevenir les membres par e-mail : decisions
-- d'adhesion, reinitialisation de mot de passe, nomination dans un departement,
-- et messages d'information envoyes a plusieurs membres.
--
-- Regle de conception : AUCUN e-mail n'est perdu ni envoye deux fois a l'aveugle.
-- Tout message est d'abord ecrit dans `email_outbox` (transactionnel), puis un
-- expediteur (immediat ou en arriere-plan) le prend en charge, le marque envoye
-- ou en echec, et reessaie les echecs temporaires.
--
-- Aucune donnee existante n'est supprimee : la colonne ajoutee a un defaut sur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Preference du membre pour les messages d'information
-- ---------------------------------------------------------------------------
-- Les e-mails transactionnels (reinitialisation de mot de passe, decision
-- d'adhesion) sont toujours envoyes : ils conditionnent l'acces au compte.
-- En revanche un membre peut refuser les messages d'information (annonces,
-- nouveautes). Le consentement est donc stocke explicitement.
alter table public.profiles
  add column if not exists email_opt_out boolean not null default false;

comment on column public.profiles.email_opt_out is
  'Le membre refuse les e-mails d''information (les e-mails transactionnels restent envoyes).';

-- ---------------------------------------------------------------------------
-- 2. Campagnes : un envoi groupe = une ligne, pour l'historique et l'audit
-- ---------------------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  -- Audience ciblee : tous les membres, uniquement les approuves, un role, un departement.
  audience text not null default 'approved'
    check (audience in ('approved', 'all_members', 'role', 'department')),
  audience_detail text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists email_campaigns_created_idx
  on public.email_campaigns (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. File d'envoi
-- ---------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),

  -- Campagne d'origine ; nulle pour un e-mail transactionnel isole.
  campaign_id uuid references public.email_campaigns (id) on delete cascade,

  -- Destinataire. `profile_id` est facultatif : un message peut viser une
  -- adresse hors application (test d'envoi, contact).
  profile_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  recipient_name text,

  subject text not null,
  body_text text not null,
  body_html text not null,

  -- Type fonctionnel : trace l'origine du message et permet des regles
  -- differentes (les transactionnels ignorent la preference d'information).
  kind text not null default 'broadcast'
    check (kind in ('broadcast', 'transactional', 'test')),

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),

  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Le tri de l'expediteur : uniquement les messages en attente et dus.
create index if not exists email_outbox_pending_idx
  on public.email_outbox (status, scheduled_at);

create index if not exists email_outbox_campaign_idx
  on public.email_outbox (campaign_id, status);

create index if not exists email_outbox_profile_idx
  on public.email_outbox (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Trigger updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at_email_outbox on public.email_outbox;
create trigger set_updated_at_email_outbox
  before update on public.email_outbox
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- L'API ecrit et lit la file avec un role proprietaire (elle contourne donc RLS).
-- Les politiques ci-dessous protegent les acces directs via PostgREST : seul un
-- administrateur peut lire l'historique des envois, personne d'autre n'y touche.
alter table public.email_campaigns enable row level security;
alter table public.email_outbox enable row level security;

drop policy if exists email_campaigns_admin_read on public.email_campaigns;
create policy email_campaigns_admin_read on public.email_campaigns
  for select to authenticated
  using (public.is_admin());

drop policy if exists email_outbox_admin_read on public.email_outbox;
create policy email_outbox_admin_read on public.email_outbox
  for select to authenticated
  using (public.is_admin());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.email_campaigns from anon;
    revoke all on public.email_outbox from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.email_campaigns to authenticated;
    grant select on public.email_outbox to authenticated;
  end if;
end
$$;
