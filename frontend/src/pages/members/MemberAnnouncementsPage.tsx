import { useQuery } from '@tanstack/react-query';
import { Bell, Pin } from 'lucide-react';
import { api } from '../../services/api';
import type { Announcement } from '../../types';
import { Badge, Card, EmptyState, LoadingBlock } from '../../components/ui';
import { formatDate } from '../../utils/format';

export function MemberAnnouncementsPage() {
  const announcementsQuery = useQuery({
    queryKey: ['members', 'announcements'],
    queryFn: ({ signal }) =>
      api.get<{ announcements: Announcement[] }>('/members/announcements', undefined, signal),
  });

  if (announcementsQuery.isLoading) return <LoadingBlock label="Chargement des annonces…" />;

  const announcements = announcementsQuery.data?.announcements ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-dark">Annonces</h1>
        <p className="text-sm text-muted">Informations réservées aux membres de l’église.</p>
      </header>

      {announcements.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" aria-hidden="true" />}
          title="Aucune annonce"
          description="Les prochaines annonces internes apparaîtront ici."
        />
      ) : (
        <ul className="space-y-4">
          {announcements.map((announcement) => (
            <li key={announcement.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{formatDate(announcement.publishedAt)}</Badge>
                  {announcement.isPinned ? (
                    <Badge tone="gold">
                      <Pin className="mr-1 h-3 w-3" aria-hidden="true" /> Épinglée
                    </Badge>
                  ) : null}
                  {announcement.expiresAt ? (
                    <span className="text-xs text-muted">Jusqu’au {formatDate(announcement.expiresAt)}</span>
                  ) : null}
                </div>
                <h2 className="font-display text-lg font-semibold text-brand-dark">{announcement.title}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{announcement.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
