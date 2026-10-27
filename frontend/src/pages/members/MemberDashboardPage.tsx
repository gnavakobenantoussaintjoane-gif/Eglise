import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, Images, Users } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import type { MemberDashboard } from '../../types';
import { Badge, Button, Card, EmptyState, LoadingBlock, Stat } from '../../components/ui';
import { EventCard } from '../../components/public/Cards';
import { MEMBER_STATUS_LABEL, formatDate } from '../../utils/format';

export function MemberDashboardPage() {
  const { profile } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ['members', 'dashboard'],
    queryFn: ({ signal }) => api.get<MemberDashboard>('/members/dashboard', undefined, signal),
  });

  if (dashboardQuery.isLoading) return <LoadingBlock label="Chargement de votre espace…" />;

  const dashboard = dashboardQuery.data;
  const departments = dashboard?.departments ?? [];
  const upcomingEvents = dashboard?.upcomingEvents ?? [];
  const announcements = dashboard?.announcements ?? [];

  return (
    <div className="space-y-6">
      <header className="surface space-y-2 p-6">
        <p className="eyebrow">Espace membre</p>
        <h1 className="text-2xl font-semibold text-brand-dark">
          Bonjour {profile?.firstName ?? ''} 👋
        </h1>
        <p className="text-sm text-muted">
          {profile?.status ? `Statut : ${MEMBER_STATUS_LABEL[profile.status]}. ` : ''}
          Retrouvez ici les nouvelles de l’église, vos départements et vos prochains rendez-vous.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Mes départements"
          value={departments.length}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          hint={departments.map((department) => department.name).join(', ') || 'Aucun pour l’instant'}
        />
        <Stat
          label="Notifications"
          value={dashboard?.unreadNotifications ?? 0}
          tone="gold"
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          hint="Messages non lus"
        />
        <Stat
          label="Événements à venir"
          value={upcomingEvents.length}
          tone="success"
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Prochains rendez-vous</h2>
            <Link to="/espace-membre/evenements" className="text-sm font-medium text-brand hover:text-brand-royal">
              Tout voir
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
              title="Aucun événement à venir"
              description="Les prochains rendez-vous de l’église s’afficheront ici."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Annonces</h2>
            <Link to="/espace-membre/annonces" className="text-sm font-medium text-brand hover:text-brand-royal">
              Tout voir
            </Link>
          </div>
          {announcements.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">Aucune annonce réservée aux membres pour le moment.</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {announcements.slice(0, 3).map((announcement) => (
                <li key={announcement.id} className="surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-dark">{announcement.title}</p>
                    {announcement.isPinned ? <Badge tone="gold">Épinglée</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{announcement.body}</p>
                  <p className="mt-2 text-xs text-muted">{formatDate(announcement.publishedAt)}</p>
                </li>
              ))}
            </ul>
          )}

          <Card className="space-y-3 bg-lavender/60">
            <h2 className="font-display text-base font-semibold text-brand-dark">Raccourcis</h2>
            <div className="grid gap-2">
              <Link to="/espace-membre/departements">
                <Button block variant="outline" icon={<Users className="h-4 w-4" aria-hidden="true" />}>
                  Rejoindre un département
                </Button>
              </Link>
              <Link to="/espace-membre/galerie">
                <Button block variant="outline" icon={<Images className="h-4 w-4" aria-hidden="true" />}>
                  Galerie privée
                </Button>
              </Link>
              <Link to="/espace-membre/profil">
                <Button block variant="ghost">
                  Mettre à jour mon profil
                </Button>
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
