-- ============================================================================
-- 0005_security_hardening.sql — Réduction des privilèges du rôle `anon`
--
-- Supabase accorde par défaut des privilèges étendus aux rôles `anon` et
-- `authenticated` sur les tables du schéma `public` (default privileges).
-- Les politiques RLS de 0002 bloquent déjà les lignes, mais un rôle ne devrait
-- même pas pouvoir interroger les tables qui ne le concernent pas : c'est le
-- principe du moindre privilège, et cela évite toute fuite si une politique
-- était un jour relâchée par erreur.
--
-- Les tables listées ici n'ont AUCUN usage public : profils, adhésions,
-- appartenances, accès nominatifs aux albums, notifications, journal d'audit,
-- finances et jetons de réinitialisation.
--
-- L'application s'y connecte avec un rôle serveur (propriétaire), qui conserve
-- tous ses droits : cette migration ne change rien pour l'API.
-- ============================================================================

do $$
declare
  t text;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
begin
  if not has_anon then
    raise notice 'Role anon absent : 0005_security_hardening.sql sans effet.';
    return;
  end if;

  foreach t in array array[
    'profiles',
    'membership_history',
    'department_members',
    'department_requests',
    'album_access',
    'notifications',
    'audit_logs',
    'contributions',
    'expenses',
    'password_reset_tokens'
  ]
  loop
    execute format('revoke all on public.%I from anon', t);
    raise notice 'anon : privileges revoques sur public.%', t;
  end loop;

  -- Sequences du journal d'audit : aucun accès public non plus.
  execute 'revoke all on sequence public.audit_logs_id_seq from anon';
exception when others then
  raise notice 'Durcissement anon partiel : %', sqlerrm;
end
$$;
