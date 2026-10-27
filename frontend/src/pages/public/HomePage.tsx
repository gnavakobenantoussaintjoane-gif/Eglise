import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Clock,
  HandHeart,
  HeartHandshake,
  MapPin,
  Quote,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import type { Album, Announcement, ChurchEvent, Department, Pagination, Sermon, Testimony } from '../../types';
import { Badge, Button, MoreLink, SectionHeading } from '../../components/ui';
import {
  AlbumCard,
  DepartmentCard,
  EventCard,
  SermonCard,
  TestimonyCard,
} from '../../components/public/Cards';
import { formatDate } from '../../utils/format';

type Collection<T, K extends string> = { [P in K]: T[] } & { pagination: Pagination };

export function HomePage() {
  const { settings } = useChurchSettings();

  const departmentsQuery = useQuery({
    queryKey: ['public', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/public/departments', undefined, signal),
  });

  const eventsQuery = useQuery({
    queryKey: ['public', 'events', 'upcoming'],
    queryFn: ({ signal }) =>
      api.get<Collection<ChurchEvent, 'events'>>('/public/events', { upcoming: true, perPage: 3 }, signal),
  });

  const sermonsQuery = useQuery({
    queryKey: ['public', 'sermons', 'latest'],
    queryFn: ({ signal }) =>
      api.get<Collection<Sermon, 'sermons'>>('/public/sermons', { perPage: 3 }, signal),
  });

  const albumsQuery = useQuery({
    queryKey: ['public', 'albums', 'latest'],
    queryFn: ({ signal }) =>
      api.get<Collection<Album, 'albums'>>('/public/albums', { perPage: 3 }, signal),
  });

  const announcementsQuery = useQuery({
    queryKey: ['public', 'announcements', 'home'],
    queryFn: ({ signal }) =>
      api.get<{ announcements: Announcement[] }>('/public/announcements', undefined, signal),
  });

  const testimoniesQuery = useQuery({
    queryKey: ['public', 'testimonies', 'home'],
    queryFn: ({ signal }) =>
      api.get<{ testimonies: Testimony[] }>('/public/testimonies', undefined, signal),
  });

  const departments = departmentsQuery.data?.departments ?? [];
  const events = eventsQuery.data?.events ?? [];
  const sermons = sermonsQuery.data?.sermons ?? [];
  const albums = albumsQuery.data?.albums ?? [];
  const announcements = announcementsQuery.data?.announcements ?? [];
  const testimonies = testimoniesQuery.data?.testimonies ?? [];
  const nextEvent = events[0];
  const serviceTimes = settings.serviceTimes.length > 0
    ? settings.serviceTimes
    : [
        { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
        { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
        { label: 'Veillée de prière', day: 'Vendredi', time: '21h00' },
      ];

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden hero-gradient text-white">
        {settings.heroUrl ? (
          <img src={settings.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        ) : null}
        <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-light/30 blur-3xl" aria-hidden="true" />

        <div className="container-page relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium tracking-wide uppercase">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Bienvenue à la maison
            </span>
            <div className="space-y-4">
              <h1 className="text-balance font-display text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
                {settings.slogan}
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
                {settings.tagline ??
                  'Une église évangélique à Abidjan où chacun est accueilli, formé et envoyé pour vivre pleinement sa foi.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/a-propos">
                <Button size="lg" variant="gold" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  Découvrir l’église
                </Button>
              </Link>
              <Link to="/predications">
                <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15">
                  Voir les prédications
                </Button>
              </Link>
            </div>
            <dl className="grid gap-4 pt-4 sm:grid-cols-3">
              {[
                { label: 'Départements actifs', value: departments.length || '10', icon: Users },
                { label: 'Cultes par semaine', value: serviceTimes.length || '3', icon: Clock },
                { label: 'Prédications en ligne', value: sermons.length || '3', icon: HeartHandshake },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3">
                  <Icon className="mb-2 h-4 w-4 text-gold" aria-hidden="true" />
                  <dt className="text-[0.7rem] tracking-wide text-white/60 uppercase">{label}</dt>
                  <dd className="font-display text-xl font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="eyebrow text-gold">Prochain rendez-vous</p>
              {nextEvent ? (
                <div className="mt-3 space-y-3">
                  <h2 className="font-display text-2xl font-semibold text-white">{nextEvent.title}</h2>
                  <p className="text-sm text-white/75">{formatDate(nextEvent.startsAt)} · {nextEvent.location ?? 'Voir détails'}</p>
                  {nextEvent.description ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-white/70">{nextEvent.description}</p>
                  ) : null}
                  <Link to={`/evenements/${nextEvent.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-white">
                    Détails de l’événement <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <p className="mt-3 text-sm text-white/75">
                  Rejoignez-nous ce dimanche pour le culte de célébration.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-3 rounded-3xl border border-white/15 bg-white/95 p-5 text-ink shadow-xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">Horaires des cultes</p>
              <ul className="space-y-2 text-sm">
                {serviceTimes.slice(0, 3).map((service, index) => (
                  <li key={`${service.label}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-brand-dark">{service.label ?? 'Culte'}</span>
                    <span className="text-xs text-muted">
                      {[service.day, service.time].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/contact" className="text-xs font-semibold text-brand-royal hover:text-brand">
                Voir le plan d’accès →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* BANDEAU DE CONFIANCE */}
      <section aria-label="Repères de l’église" className="border-b border-line bg-lavender/50">
        <div className="container-page grid gap-6 py-8 sm:grid-cols-3">
          {[
            { icon: MapPin, title: 'Nous trouver', text: [settings.address, settings.city].filter(Boolean).join(', ') || 'Abidjan, Côte d’Ivoire' },
            { icon: CalendarDays, title: 'Cultes', text: serviceTimes.map((s) => `${s.day ?? ''} ${s.time ?? ''}`.trim()).slice(0, 3).join(' · ') || 'Dimanche 09h00' },
            { icon: HandHeart, title: 'Besoin de prière ?', text: 'Une équipe prie chaque semaine pour vos intentions.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-brand-dark">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* VISION */}
      <section className="container-page py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="space-y-4">
            <p className="eyebrow">Notre maison</p>
            <h2 className="text-3xl font-semibold text-brand-dark sm:text-4xl">
              {settings.churchName}
            </h2>
            <p className="text-base leading-relaxed text-muted">
              {settings.about ??
                'Née d’un petit groupe de prière, La Forteresse de l’Éternel est une famille spirituelle qui croit à la puissance de la Parole de Dieu et à la transformation des vies par l’Évangile.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Notre vision', text: settings.vision ?? 'Former des disciples affermis dans la Parole.', icon: Sparkles },
                { title: 'Notre mission', text: settings.mission ?? 'Accueillir, former et envoyer.', icon: HeartHandshake },
              ].map(({ title, text, icon: Icon }) => (
                <div key={title} className="surface-muted p-4">
                  <Icon className="mb-2 h-5 w-5 text-brand-royal" aria-hidden="true" />
                  <p className="text-sm font-semibold text-brand-dark">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>
            <Link to="/a-propos">
              <Button variant="outline">En savoir plus sur nous</Button>
            </Link>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-royal via-brand to-brand-dark p-8 text-white">
              <Quote className="h-8 w-8 text-gold" aria-hidden="true" />
              <blockquote className="mt-4 font-display text-2xl leading-snug">
                « Dieu est pour nous un refuge et un appui, un secours qui ne manque jamais dans la détresse. »
              </blockquote>
              <p className="mt-3 text-sm text-white/70">Psaume 46.1</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Link to="/inscription" className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">
                  Devenir membre
                </Link>
                <Link to="/departements" className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">
                  Rejoindre un département
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ÉVÉNEMENTS */}
      {events.length > 0 ? (
        <section className="bg-lavender/50 py-16 sm:py-20">
          <div className="container-page space-y-8">
            <SectionHeading
              eyebrow="Agenda"
              title="Nos prochains rendez-vous"
              description="Conférences, veillées, sorties et journées spéciales : venez vivre des moments forts avec la communauté."
              action={<MoreLink to="/evenements">Tous les événements</MoreLink>}
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* PREDICATIONS */}
      {sermons.length > 0 ? (
        <section className="container-page py-16 sm:py-20">
          <div className="space-y-8">
            <SectionHeading
              eyebrow="La Parole"
              title="Dernières prédications"
              description="Réécoutez ou relisez les messages qui ont marqué la vie de l’église."
              action={<MoreLink to="/predications">Toutes les prédications</MoreLink>}
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sermons.map((sermon) => (
                <SermonCard key={sermon.id} sermon={sermon} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* DÉPARTEMENTS */}
      {departments.length > 0 ? (
        <section className="bg-brand-dark py-16 text-white sm:py-20">
          <div className="container-page space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">Servir ensemble</p>
                <h2 className="text-2xl font-semibold sm:text-3xl">Nos départements</h2>
                <p className="text-sm leading-relaxed text-white/70">
                  Chaque membre est invité à mettre ses talents au service de Dieu et de la communauté.
                </p>
              </div>
              <Link to="/departements" className="text-sm font-semibold text-gold hover:text-white">
                Voir tous les départements →
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {departments.slice(0, 6).map((department) => (
                <div key={department.id} className="text-ink">
                  <DepartmentCard department={department} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* GALERIE */}
      {albums.length > 0 ? (
        <section className="container-page py-16 sm:py-20">
          <div className="space-y-8">
            <SectionHeading
              eyebrow="Souvenirs"
              title="La vie de l’église en images"
              description="Cultes, conventions et activités : revivez les moments partagés."
              action={<MoreLink to="/galerie">Toute la galerie</MoreLink>}
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ANNONCES + TEMOIGNAGES */}
      <section className="bg-lavender/50 py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <SectionHeading eyebrow="À retenir" title="Annonces" description="Les informations pratiques de la semaine." />
            {announcements.length === 0 ? (
              <p className="text-sm text-muted">Aucune annonce pour le moment.</p>
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
            <MoreLink to="/annonces">Toutes les annonces</MoreLink>
          </div>

          <div className="space-y-6">
            <SectionHeading
              eyebrow="Témoignages"
              title="Ce que Dieu fait"
              description="Des vies transformées, racontées avec simplicité."
              action={<MoreLink to="/temoignages">Partager un témoignage</MoreLink>}
            />
            {testimonies.length === 0 ? (
              <p className="text-sm text-muted">Soyez le premier à partager ce que Dieu a fait.</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {testimonies.slice(0, 2).map((testimony) => (
                  <TestimonyCard key={testimony.id} testimony={testimony} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-page py-16 sm:py-20">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand-royal to-brand-dark px-6 py-12 text-center text-white sm:px-12">
          <p className="eyebrow text-gold">Prochaine étape</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Vous êtes attendu, quel que soit votre parcours
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/75">
            Créez votre compte, présentez-vous à un responsable et rejoignez une famille qui marche ensemble.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/inscription">
              <Button size="lg" variant="gold">
                Devenir membre
              </Button>
            </Link>
            <Link to="/priere">
              <Button size="lg" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15">
                Demander la prière
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
