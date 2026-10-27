import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { api } from '../../services/api';
import type { ChurchEvent, Pagination } from '../../types';
import { EmptyState, PaginationControls, SkeletonGrid } from '../../components/ui';
import { EventCard } from '../../components/public/Cards';
import { cn } from '../../utils/cn';

interface EventListResponse {
  events: ChurchEvent[];
  pagination: Pagination;
}

type Tab = 'upcoming' | 'past';

export function MemberEventsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [page, setPage] = useState(1);

  const eventsQuery = useQuery({
    queryKey: ['members', 'events', tab, page],
    queryFn: ({ signal }) =>
      api.get<EventListResponse>(
        '/members/events',
        { page, perPage: 9, upcoming: tab === 'upcoming' ? true : undefined, past: tab === 'past' ? true : undefined },
        signal,
      ),
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-brand-dark">Événements</h1>
        <p className="text-sm text-muted">Inscrivez-vous aux prochains rendez-vous de l’église.</p>
      </header>

      <div className="inline-flex rounded-full border border-line bg-white p-1">
        {(
          [
            { id: 'upcoming', label: 'À venir' },
            { id: 'past', label: 'Passés' },
          ] as { id: Tab; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              setPage(1);
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              tab === entry.id ? 'bg-brand text-white' : 'text-muted hover:text-brand',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {eventsQuery.isLoading ? (
        <SkeletonGrid items={4} />
      ) : (eventsQuery.data?.events.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          title={tab === 'upcoming' ? 'Aucun événement à venir' : 'Aucun événement passé'}
          description={
            tab === 'upcoming'
              ? 'Les prochains rendez-vous apparaîtront ici.'
              : 'L’historique sera disponible prochainement.'
          }
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {eventsQuery.data?.events.map((event) => (
              <div key={event.id} className="space-y-2">
                <EventCard event={event} />
                <p className="px-1 text-xs text-muted">
                  <Link to={`/evenements/${event.slug}`} className="font-medium text-brand hover:text-brand-royal">
                    Voir la fiche et s’inscrire →
                  </Link>
                </p>
              </div>
            ))}
          </div>
          <PaginationControls
            page={eventsQuery.data?.pagination.page ?? 1}
            totalPages={eventsQuery.data?.pagination.totalPages ?? 1}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}

