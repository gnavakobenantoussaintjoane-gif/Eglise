import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  Coins,
  Image as ImageIcon,
  MessageSquareQuote,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import type { AdminDashboard } from '../../types';
import { Alert, Button, Card, EmptyState, LoadingBlock } from '../../components/ui';
import { AdminHeading, StatCard } from '../../components/admin/AdminKit';
import { formatCurrency, formatDateTime, formatRelative } from '../../utils/format';

export function AdminDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: ({ signal }) => api.get<AdminDashboard>('/admin/dashboard', undefined, signal),
  });

  if (dashboardQuery.isLoading) return <LoadingBlock label="Chargement du tableau de bord…" />;
  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Alert tone="danger" role="alert" title="Données indisponibles">
        Le tableau de bord n’a pas pu être chargé. Vérifiez la connexion à la base de données.
      </Alert>
    );
  }

  const data = dashboardQuery.data;
  const maxTrend = Math.max(1, ...data.signupTrend.map((entry) => entry.total));

  return (
    <>
      <AdminHeading
        title="Tableau de bord"
        description="Vue d’ensemble des membres, contenus et tâches en attente. Les chiffres proviennent directement de la base de données."
        actions={
          <Link to="/admin/membres">
            <Button size="sm">
              <UserCheck className="h-4 w-4" aria-hidden="true" /> Traiter les demandes
            </Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Membres approuvés" value={data.members.approved} hint={`${data.members.total} comptes au total`} icon={<Users className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Demandes en attente" value={data.members.pending} hint="À examiner" tone="warning" icon={<UserCheck className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Albums publiés" value={data.albums.published} hint={`${data.albums.photos} photos stockées`} tone="info" icon={<ImageIcon className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Solde interne" value={formatCurrency(data.finance.balance, data.finance.currency)} hint="Contributions − dépenses" tone="success" icon={<Coins className="h-5 w-5" aria-hidden="true" />} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Prédications publiées" value={data.sermons.published} icon={<BookOpen className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Événements à venir" value={data.events.upcoming} icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Prières à traiter" value={data.prayerRequests.new} tone="warning" icon={<MessageSquareQuote className="h-5 w-5" aria-hidden="true" />} />
        <StatCard label="Témoignages à modérer" value={data.testimonies.pending} tone="warning" icon={<Bell className="h-5 w-5" aria-hidden="true" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Demandes d’adhésion en attente</h2>
            <Link to="/admin/membres" className="text-sm font-medium text-brand hover:underline">
              Tout voir
            </Link>
          </div>
          {data.pendingMembers.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="h-7 w-7" aria-hidden="true" />}
              title="Aucune demande en attente"
              description="Toutes les inscriptions ont été traitées."
            />
          ) : (
            <ul className="space-y-2">
              {data.pendingMembers.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{member.fullName || '(sans nom)'}</p>
                    <p className="text-xs text-muted">
                      {member.email}
                      {member.city ? ` · ${member.city}` : ''}
                      {member.submittedAt ? ` · soumise ${formatRelative(member.submittedAt)}` : ''}
                    </p>
                  </div>
                  <Link to={`/admin/membres?detail=${member.id}`}>
                    <Button size="sm" variant="outline">
                      Examiner
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Nouvelles inscriptions</h2>
            {data.signupTrend.length > 0 ? (
              <ul className="space-y-2">
                {data.signupTrend.map((entry) => (
                  <li key={entry.month} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-xs text-muted">{entry.month}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-lavender">
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(6, (entry.total / maxTrend) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-xs font-medium text-ink/80">{entry.total}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucune inscription sur les 6 derniers mois.</p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Activity className="h-4 w-4 text-brand-accent" aria-hidden="true" /> Activité récente
            </h2>
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted">Aucune action enregistrée.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentActivity.map((entry, index) => (
                  <li key={`${entry.createdAt}-${index}`} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-mono text-xs text-brand">{entry.action}</p>
                    <p className="text-xs text-muted">
                      {entry.actorEmail ?? 'système'} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/admin/journal" className="text-sm font-medium text-brand hover:underline">
              Journal d’audit complet →
            </Link>
          </Card>

          {data.takedownRequests.pending > 0 ? (
            <Alert tone="warning" title="Demandes de retrait de photo">
              {data.takedownRequests.pending} demande(s) en attente.{' '}
              <Link to="/admin/temoignages" className="font-medium underline">
                Traiter
              </Link>
            </Alert>
          ) : null}

          {data.members.suspended > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {data.members.suspended} compte(s) suspendu(s) — vérifiez les motifs dans les fiches membres.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
