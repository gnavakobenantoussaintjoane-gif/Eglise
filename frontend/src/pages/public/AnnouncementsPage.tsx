import { useQuery } from '@tanstack/react-query';
import { Bell, Pin } from 'lucide-react';
import { api } from '../../services/api';
import type { Announcement } from '../../types';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader } from '../../components/ui';
import { formatDate } from '../../utils/format';

export function AnnouncementsPage() {
  const announcementsQuery = useQuery({
    queryKey: ['public', 'announcements'],
    queryFn: ({ signal }) => api.get<{ announcements: Announcement[] }>('/public/announcements', undefined, signal),
  });

  const announcements = announcementsQuery.data?.announcements ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Vie de l’église"
        title="Annonces"
        description="Les informations pratiques à retenir cette semaine : cultes spéciaux, réunions, activités et nouvelles de la communauté."
      />

      <section className="container-page py-12">
        {announcementsQuery.isLoading ? (
          <LoadingBlock label="Chargement des annonces…" />
        ) : announcements.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" aria-hidden="true" />}
            title="Aucune annonce pour le moment"
            description="Revenez bientôt : les annonces de l’église sont publiées ici."
          />
        ) : (
          <ul className="space-y-4">
            {announcements.map((announcement) => (
              <li key={announcement.id}>
                <Card as="article" className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {announcement.isPinned ? (
                      <Badge tone="warning">
                        <Pin className="mr-1 h-3 w-3" aria-hidden="true" /> Épinglée
                      </Badge>
                    ) : null}
                    <Badge tone="brand">{formatDate(announcement.publishedAt)}</Badge>
                    {announcement.expiresAt ? (
                      <span className="text-xs text-muted">
                        Jusqu’au {formatDate(announcement.expiresAt)}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="font-display text-lg font-semibold text-ink">{announcement.title}</h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{announcement.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
        {!announcementsQuery.isLoading && announcements.length > 0 ? (
          <p className="mt-8 text-sm text-muted">
            Les membres approuvés retrouvent l’ensemble des annonces dans leur espace membre.
          </p>
        ) : null}
      </section>
    </>
  );
}
