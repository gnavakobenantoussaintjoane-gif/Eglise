-- ============================================================================
-- 0002_rls.sql — Row Level Security
-- Defense en profondeur : l'API applique deja l'autorisation, ces politiques
-- protegent les acces directs a la base (cle anon, clients tiers, erreurs).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fonctions d'autorisation (SECURITY DEFINER : evite la recursion RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'approved'
  );
$$;

create or replace function public.is_media()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('media', 'admin')
      and p.status = 'approved'
  );
$$;

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
  );
$$;

create or replace function public.is_department_leader(target_department uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.departments d
    left join public.department_members dm
      on dm.department_id = d.id and dm.profile_id = auth.uid()
    where d.id = target_department
      and (d.leader_id = auth.uid() or dm.member_role in ('leader', 'assistant'))
      and dm.status = 'active'
  );
$$;

create or replace function public.can_view_album(target_album uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.albums a
    where a.id = target_album
      and (
        public.is_media()
        or (
          a.status = 'published'
          and (
            a.access = 'public'
            or (a.access = 'members' and public.is_approved_member())
            or (
              a.access = 'restricted'
              and (
                public.is_approved_member()
                and exists (
                  select 1 from public.album_access aa
                  where aa.album_id = a.id and aa.profile_id = auth.uid()
                )
              )
            )
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Activation de RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'church_settings', 'departments', 'profiles', 'membership_history',
    'department_members', 'department_requests', 'albums', 'photos',
    'album_access', 'photo_takedown_requests', 'sermons', 'events',
    'event_registrations', 'announcements', 'prayer_requests', 'testimonies',
    'notifications', 'audit_logs', 'contributions', 'expenses',
    'password_reset_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Parametres de l'eglise
-- ---------------------------------------------------------------------------
drop policy if exists church_settings_read on public.church_settings;
create policy church_settings_read on public.church_settings
  for select to anon, authenticated using (true);

drop policy if exists church_settings_admin_write on public.church_settings;
create policy church_settings_admin_write on public.church_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (public.is_media() and status = 'approved')
    or (
      status = 'approved'
      and exists (
        select 1 from public.department_members dm
        where dm.profile_id = profiles.id
          and dm.status = 'active'
          and public.is_department_leader(dm.department_id)
      )
    )
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and role = 'member'
    and status in ('profile_incomplete', 'pending_review')
  );

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Historique d'adhesion : lecture par le membre concerne, ecriture admin
-- ---------------------------------------------------------------------------
drop policy if exists membership_history_select on public.membership_history;
create policy membership_history_select on public.membership_history
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists membership_history_admin_write on public.membership_history;
create policy membership_history_admin_write on public.membership_history
  for insert to authenticated with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Departements
-- ---------------------------------------------------------------------------
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments
  for select to anon, authenticated using (is_active and archived_at is null);

drop policy if exists departments_privileged_read on public.departments;
create policy departments_privileged_read on public.departments
  for select to authenticated
  using (public.is_admin() or public.is_department_leader(id));

drop policy if exists departments_admin_write on public.departments;
create policy departments_admin_write on public.departments
  for insert to authenticated with check (public.is_admin());

drop policy if exists departments_admin_update on public.departments;
create policy departments_admin_update on public.departments
  for update to authenticated
  using (public.is_admin() or public.is_department_leader(id))
  with check (public.is_admin() or public.is_department_leader(id));

drop policy if exists departments_admin_delete on public.departments;
create policy departments_admin_delete on public.departments
  for delete to authenticated using (public.is_admin());

-- Membres d'un departement
drop policy if exists department_members_select on public.department_members;
create policy department_members_select on public.department_members
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.is_department_leader(department_id)
  );

drop policy if exists department_members_write on public.department_members;
create policy department_members_write on public.department_members
  for insert to authenticated
  with check (public.is_admin() or public.is_department_leader(department_id));

drop policy if exists department_members_update on public.department_members;
create policy department_members_update on public.department_members
  for update to authenticated
  using (public.is_admin() or public.is_department_leader(department_id))
  with check (public.is_admin() or public.is_department_leader(department_id));

drop policy if exists department_members_delete on public.department_members;
create policy department_members_delete on public.department_members
  for delete to authenticated
  using (public.is_admin() or public.is_department_leader(department_id));

-- Demandes de departement
drop policy if exists department_requests_select on public.department_requests;
create policy department_requests_select on public.department_requests
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.is_department_leader(department_id)
  );

drop policy if exists department_requests_insert on public.department_requests;
create policy department_requests_insert on public.department_requests
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_approved_member());

drop policy if exists department_requests_update on public.department_requests;
create policy department_requests_update on public.department_requests
  for update to authenticated
  using (public.is_admin() or public.is_department_leader(department_id))
  with check (public.is_admin() or public.is_department_leader(department_id));

-- ---------------------------------------------------------------------------
-- Galerie
-- ---------------------------------------------------------------------------
drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums
  for select to anon, authenticated using (public.can_view_album(id));

drop policy if exists albums_write on public.albums;
create policy albums_write on public.albums
  for insert to authenticated with check (public.is_media());

drop policy if exists albums_update on public.albums;
create policy albums_update on public.albums
  for update to authenticated
  using (public.is_media()) with check (public.is_media());

drop policy if exists albums_delete on public.albums;
create policy albums_delete on public.albums
  for delete to authenticated using (public.is_admin());

drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select to anon, authenticated using (public.can_view_album(album_id));

drop policy if exists photos_write on public.photos;
create policy photos_write on public.photos
  for insert to authenticated with check (public.is_media());

drop policy if exists photos_update on public.photos;
create policy photos_update on public.photos
  for update to authenticated
  using (public.is_media()) with check (public.is_media());

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos
  for delete to authenticated using (public.is_media());

drop policy if exists album_access_select on public.album_access;
create policy album_access_select on public.album_access
  for select to authenticated
  using (profile_id = auth.uid() or public.is_media());

drop policy if exists album_access_write on public.album_access;
create policy album_access_write on public.album_access
  for all to authenticated
  using (public.is_media()) with check (public.is_media());

drop policy if exists photo_takedown_insert on public.photo_takedown_requests;
create policy photo_takedown_insert on public.photo_takedown_requests
  for insert to anon, authenticated with check (true);

drop policy if exists photo_takedown_admin on public.photo_takedown_requests;
create policy photo_takedown_admin on public.photo_takedown_requests
  for select to authenticated using (public.is_admin());

drop policy if exists photo_takedown_admin_update on public.photo_takedown_requests;
create policy photo_takedown_admin_update on public.photo_takedown_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Predications / evenements : lecture publique si publies
-- ---------------------------------------------------------------------------
drop policy if exists sermons_select on public.sermons;
create policy sermons_select on public.sermons
  for select to anon, authenticated using (is_published or public.is_admin());

drop policy if exists sermons_write on public.sermons;
create policy sermons_write on public.sermons
  for insert to authenticated with check (public.is_admin());

drop policy if exists sermons_update on public.sermons;
create policy sermons_update on public.sermons
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists sermons_delete on public.sermons;
create policy sermons_delete on public.sermons
  for delete to authenticated using (public.is_admin());

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to anon, authenticated using (is_published or public.is_admin());

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for insert to authenticated with check (public.is_admin());

drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated using (public.is_admin());

drop policy if exists event_registrations_insert on public.event_registrations;
create policy event_registrations_insert on public.event_registrations
  for insert to anon, authenticated with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.is_published and e.registration_open
    )
  );

drop policy if exists event_registrations_select on public.event_registrations;
create policy event_registrations_select on public.event_registrations
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Annonces
-- ---------------------------------------------------------------------------
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      audience = 'public'
      and published_at <= now()
      and (expires_at is null or expires_at > now())
    )
    or (
      audience = 'members'
      and public.is_approved_member()
      and published_at <= now()
      and (expires_at is null or expires_at > now())
    )
  );

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for insert to authenticated with check (public.is_admin());

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Demandes de priere (donnees sensibles : jamais exposees publiquement)
-- ---------------------------------------------------------------------------
drop policy if exists prayer_requests_insert on public.prayer_requests;
create policy prayer_requests_insert on public.prayer_requests
  for insert to anon, authenticated with check (true);

drop policy if exists prayer_requests_select on public.prayer_requests;
create policy prayer_requests_select on public.prayer_requests
  for select to authenticated
  using (
    public.is_admin()
    or (profile_id is not null and profile_id = auth.uid())
    or (profile_id is not null and public.is_approved_member() and not is_private)
  );

drop policy if exists prayer_requests_update on public.prayer_requests;
create policy prayer_requests_update on public.prayer_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Temoignages
-- ---------------------------------------------------------------------------
drop policy if exists testimonies_select on public.testimonies;
create policy testimonies_select on public.testimonies
  for select to anon, authenticated
  using (
    public.is_admin()
    or (status = 'approved' and is_public)
    or (profile_id is not null and profile_id = auth.uid())
  );

drop policy if exists testimonies_insert on public.testimonies;
create policy testimonies_insert on public.testimonies
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_approved_member() and status = 'pending');

drop policy if exists testimonies_moderate on public.testimonies;
create policy testimonies_moderate on public.testimonies
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists testimonies_delete on public.testimonies;
create policy testimonies_delete on public.testimonies
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Notifications : strictement personnelles
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit / finances : administrateurs uniquement
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_admin());

drop policy if exists contributions_admin on public.contributions;
create policy contributions_admin on public.contributions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Jetons de reinitialisation : aucun acces client
-- ---------------------------------------------------------------------------
drop policy if exists password_reset_tokens_deny on public.password_reset_tokens;
create policy password_reset_tokens_deny on public.password_reset_tokens
  for select to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Privileges (Supabase les accorde par defaut ; explicite pour un PostgreSQL nu)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  if not has_auth then
    return;
  end if;

  grant usage on schema public to authenticated;
  if has_anon then
    grant usage on schema public to anon;
  end if;

  foreach t in array array[
    'church_settings', 'departments', 'albums', 'photos', 'sermons', 'events',
    'event_registrations', 'announcements', 'prayer_requests', 'testimonies',
    'photo_takedown_requests'
  ]
  loop
    execute format('grant select on public.%I to authenticated', t);
    if has_anon then
      execute format('grant select on public.%I to anon', t);
    end if;
  end loop;

  if has_anon then
    grant insert on public.prayer_requests to anon;
    grant insert on public.event_registrations to anon;
    grant insert on public.photo_takedown_requests to anon;
  end if;

  foreach t in array array[
    'profiles', 'membership_history', 'department_members', 'department_requests',
    'album_access', 'notifications', 'audit_logs', 'contributions', 'expenses'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;

  foreach t in array array[
    'church_settings', 'departments', 'albums', 'photos', 'sermons', 'events',
    'event_registrations', 'announcements', 'prayer_requests', 'testimonies',
    'photo_takedown_requests'
  ]
  loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;

  if has_anon then
    execute 'grant insert on public.prayer_requests to anon';
  end if;
end
$$;
