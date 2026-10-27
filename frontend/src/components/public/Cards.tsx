import { Link } from 'react-router-dom';
import { CalendarDays, Clock, Lock, MapPin, Mic, PlayCircle, Quote, Users } from 'lucide-react';
import type { Album, ChurchEvent, Department, Sermon, Testimony } from '../../types';
import { Badge, MoreLink } from '../ui';
import { ALBUM_ACCESS_LABEL, formatDate, formatDateRange, formatRelative } from '../../utils/format';
import { cn } from '../../utils/cn';

export function SermonCard({ sermon }: { sermon: Sermon }) {
  return (
    <article className="surface group flex h-full flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-brand/30">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="brand">{sermon.series ?? 'Message'}</Badge>
        <span className="text-xs text-muted">{sermon.preachedOn ? formatDate(sermon.preachedOn) : '—'}</span>
      </div>
      <h3 className="font-display text-lg leading-snug font-semibold text-brand-dark">
        <Link to={`/predications/${sermon.slug}`} className="hover:text-brand">
          {sermon.title}
        </Link>
      </h3>
      {sermon.summary ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-muted">{sermon.summary}</p>
      ) : null}
      <dl className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <div className="flex items-center gap-1">
          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
          <dt className="sr-only">Prédicateur</dt>
          <dd>{sermon.speaker}</dd>
        </div>
        {sermon.scripture ? (
          <div className="flex items-center gap-1">
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <dt className="sr-only">Passage</dt>
            <dd>{sermon.scripture}</dd>
          </div>
        ) : null}
      </dl>
      <MoreLink to={`/predications/${sermon.slug}`}>
        {sermon.audioUrl ? 'Écouter le message' : 'Lire le message'}
      </MoreLink>
    </article>
  );
}

export function EventCard({ event }: { event: ChurchEvent }) {
  const date = new Date(event.startsAt);
  const day = Number.isNaN(date.getTime()) ? '—' : String(date.getDate()).padStart(2, '0');
  const month = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');

  return (
    <article className="surface group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand/30">
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-brand to-brand-royal">
        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-white/80">
            <CalendarDays className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-col items-center rounded-xl bg-white/95 px-3 py-1.5 text-brand">
          <span className="font-display text-lg leading-none font-bold">{day}</span>
          <span className="text-[0.65rem] font-semibold tracking-wide uppercase">{month}</span>
        </div>
        {event.registrationOpen ? (
          <span className="absolute top-3 right-3">
            <Badge tone="gold">Inscriptions ouvertes</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-lg leading-snug font-semibold text-brand-dark">
          <Link to={`/evenements/${event.slug}`} className="hover:text-brand">
            {event.title}
          </Link>
        </h3>
        <p className="text-xs text-muted">{formatDateRange(event.startsAt, event.endsAt)}</p>
        {event.location ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {event.location}
          </p>
        ) : null}
        {event.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{event.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between pt-2">
          {event.capacity ? (
            <span className="text-xs text-muted">
              {event.remainingSeats === 0 ? 'Complet' : `${event.remainingSeats} place(s) restante(s)`}
            </span>
          ) : (
            <span className="text-xs text-muted">{event.registeredCount} inscrit(s)</span>
          )}
          <MoreLink to={`/evenements/${event.slug}`}>Détails</MoreLink>
        </div>
      </div>
    </article>
  );
}

export function DepartmentCard({ department }: { department: Department }) {
  return (
    <article className="surface group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand/30">
      <div className="relative h-32 bg-gradient-to-br from-brand-royal to-brand-dark">
        {department.imageUrl ? (
          <img src={department.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-white/70">
            <Users className="h-9 w-9" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-lg font-semibold text-brand-dark">
          <Link to={`/departements/${department.slug}`} className="hover:text-brand">
            {department.name}
          </Link>
        </h3>
        {department.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{department.description}</p>
        ) : null}
        <dl className="mt-auto space-y-1 text-xs text-muted">
          {department.meetingDay || department.meetingTime ? (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <dd>{[department.meetingDay, department.meetingTime].filter(Boolean).join(' · ')}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <dd>{department.memberCount} membre(s)</dd>
          </div>
        </dl>
        {department.leader ? (
          <p className="text-xs text-muted">Responsable : {department.leader.fullName}</p>
        ) : null}
      </div>
    </article>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <article className="surface group overflow-hidden transition hover:-translate-y-0.5 hover:border-brand/30">
      <Link to={`/galerie/${album.slug}`} className="block">
        <div className="relative aspect-4/3 overflow-hidden bg-lavender-deep">
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt=""
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-brand/40">
              <Users className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-brand-dark/85 to-transparent px-3 py-2 text-white">
            <span className="text-xs font-medium">{album.photoCount} photo(s)</span>
            {album.access !== 'public' ? (
              <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {ALBUM_ACCESS_LABEL[album.access]}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <div className="space-y-1 p-4">
        <h3 className="font-display text-base font-semibold text-brand-dark">
          <Link to={`/galerie/${album.slug}`} className="hover:text-brand">
            {album.title}
          </Link>
        </h3>
        <p className="text-xs text-muted">
          {album.eventDate ? formatDate(album.eventDate) : formatRelative(album.createdAt)}
        </p>
      </div>
    </article>
  );
}

export function TestimonyCard({ testimony }: { testimony: Testimony }) {
  return (
    <figure className="surface flex h-full flex-col gap-3 p-6">
      <Quote className="h-6 w-6 text-brand-light" aria-hidden="true" />
      <blockquote className="flex-1 text-sm leading-relaxed text-ink/80">“{testimony.body}”</blockquote>
      <figcaption className="text-sm font-semibold text-brand">
        {testimony.authorName}
        <span className="mt-0.5 block text-xs font-normal text-muted">{testimony.title}</span>
      </figcaption>
    </figure>
  );
}

export function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-brand/20 px-4 py-2 text-sm font-medium text-brand transition hover:bg-lavender',
      )}
    >
      {label}
    </Link>
  );
}
