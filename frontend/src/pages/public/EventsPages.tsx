import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../services/api';
import type { ChurchEvent, Pagination } from '../../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  PaginationControls,
  Select,
  SkeletonGrid,
  Textarea,
} from '../../components/ui';
import { EventCard } from '../../components/public/Cards';
import { formatDateRange } from '../../utils/format';
import { cn } from '../../utils/cn';

interface EventListResponse {
  events: ChurchEvent[];
  pagination: Pagination;
}

type Tab = 'upcoming' | 'past';

export function EventsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [page, setPage] = useState(1);

  const eventsQuery = useQuery({
    queryKey: ['public', 'events', tab, page],
    queryFn: ({ signal }) =>
      api.get<EventListResponse>(
        '/public/events',
        { page, perPage: 9, upcoming: tab === 'upcoming' ? true : undefined, past: tab === 'past' ? true : undefined },
        signal,
      ),
  });

  return (
    <>
      <PageHeader
        eyebrow="Agenda"
        title="Événements"
        description="Cultes spéciaux, conventions, veillées et sorties : retrouvez tous les rendez-vous de l’église."
      />

      <section className="container-page py-12">
        <div className="mb-8 inline-flex rounded-full border border-line bg-white p-1">
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
          <SkeletonGrid items={6} />
        ) : eventsQuery.isError ? (
          <Alert tone="danger" title="Événements indisponibles">
            {eventsQuery.error instanceof ApiError ? eventsQuery.error.message : 'Réessayez dans un instant.'}
          </Alert>
        ) : (eventsQuery.data?.events.length ?? 0) === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
            title={tab === 'upcoming' ? 'Aucun événement à venir' : 'Aucun événement passé'}
            description={
              tab === 'upcoming'
                ? 'Les prochains rendez-vous seront publiés très bientôt.'
                : 'L’historique des événements apparaîtra ici.'
            }
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {eventsQuery.data?.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <PaginationControls
              page={eventsQuery.data?.pagination.page ?? 1}
              totalPages={eventsQuery.data?.pagination.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', seats: '1', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const eventQuery = useQuery({
    queryKey: ['public', 'event', slug],
    queryFn: ({ signal }) => api.get<ChurchEvent>(`/public/events/${slug}`, undefined, signal),
    enabled: Boolean(slug),
    retry: false,
  });

  if (eventQuery.isLoading) {
    return (
      <div className="container-page py-20">
        <LoadingBlock label="Chargement de l’événement…" />
      </div>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <div className="container-page py-20">
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          title="Événement introuvable"
          description="Cet événement n’existe pas ou n’est plus publié."
          action={
            <Link to="/evenements">
              <Button variant="outline">Tous les événements</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const event = eventQuery.data;
  const full = event.capacity !== null && event.remainingSeats === 0;

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (form.fullName.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) {
      toast.error('Merci d’indiquer votre nom et une adresse e-mail valide.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/public/events/${event.slug}/register`, {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || undefined,
        seats: Number(form.seats) || 1,
        note: form.note || undefined,
      });
      setRegistered(true);
      toast.success('Votre inscription est enregistrée.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Inscription impossible, réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={event.category ?? 'Événement'} title={event.title}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden="true" /> {formatDateRange(event.startsAt, event.endsAt)}
          </span>
          {event.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {event.location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" aria-hidden="true" /> {event.registeredCount} inscrit(s)
          </span>
          {event.registrationOpen && !full ? <Badge tone="gold">Inscriptions ouvertes</Badge> : null}
          {full ? <Badge tone="danger">Complet</Badge> : null}
        </div>
      </PageHeader>

      <section className="container-page grid gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="space-y-6">
          {event.coverUrl ? (
            <img src={event.coverUrl} alt="" className="w-full rounded-2xl object-cover shadow-sm" />
          ) : null}
          <div className="prose-church text-base leading-relaxed text-ink/80">
            {(event.description ?? 'Les détails de cet événement seront communiqués prochainement.')
              .split('\n')
              .filter(Boolean)
              .map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
          </div>
          <Link to="/evenements" className="text-sm font-medium text-brand hover:text-brand-royal">
            ← Tous les événements
          </Link>
        </article>

        <aside className="space-y-5">
          {!event.registrationOpen ? (
            <Alert tone="info" title="Inscriptions fermées">
              Cet événement n’ouvre pas d’inscription en ligne. Contactez le secrétariat pour plus d’informations.
            </Alert>
          ) : registered ? (
            <div className="surface space-y-3 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-brand-dark">Inscription confirmée</h2>
              <p className="text-sm text-muted">
                Un récapitulatif a été préparé pour les responsables. Merci de votre engagement !
              </p>
              <Button variant="outline" onClick={() => setRegistered(false)}>
                Inscrire une autre personne
              </Button>
            </div>
          ) : full ? (
            <Alert tone="warning" title="Événement complet">
              Toutes les places sont déjà prises. Contactez-nous pour être placé sur liste d’attente.
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="surface space-y-4 p-6" noValidate>
              <h2 className="font-display text-lg font-semibold text-brand-dark">Je m’inscris</h2>
              <Input
                label="Nom complet"
                required
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              />
              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Téléphone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
                <Select
                  label="Nombre de places"
                  options={Array.from({ length: Math.min(event.remainingSeats ?? 10, 10) }, (_, index) => ({
                    value: String(index + 1),
                    label: `${index + 1} place${index > 0 ? 's' : ''}`,
                  }))}
                  value={form.seats}
                  onChange={(event) => setForm({ ...form, seats: event.target.value })}
                />
              </div>
              <Textarea
                label="Remarque (facultatif)"
                rows={2}
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
              <Button type="submit" block loading={submitting}>
                Confirmer l’inscription
              </Button>
              {event.capacity ? (
                <p className="text-center text-xs text-muted">
                  {event.remainingSeats} place(s) encore disponible(s) sur {event.capacity}.
                </p>
              ) : null}
            </form>
          )}
        </aside>
      </section>
    </>
  );
}
