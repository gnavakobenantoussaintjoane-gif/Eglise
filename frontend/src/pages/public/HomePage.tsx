import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, HandHeart, MapPin } from 'lucide-react';
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
import { AnimatedHero } from '../../components/public/AnimatedHero';
import { VisionSignature } from '../../components/public/VisionSignature';
import { Reveal } from '../../components/public/Reveal';
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
  const serviceTimes = settings.serviceTimes.length > 0
    ? settings.serviceTimes
    : [
        { label: 'Culte de célébration', day: 'Dimanche', time: '09h00' },
        { label: 'Étude biblique', day: 'Mercredi', time: '18h30' },
        { label: 'Veillée de prière', day: 'Vendredi', time: '21h00' },
      ];

  const heroUrl = settings.heroUrl;

  return (
    <>
      {/* HERO — animé, alimenté par les réglages et par l'agenda réel */}
      <AnimatedHero
        settings={{ ...settings, heroUrl }}
        departments={departments}
        sermons={sermons}
        events={events}
      />

      {/* BANDEAU DE CONFIANCE */}
      <Reveal
        as="section"
        aria-label="Repères de l’église"
        className="border-b border-line bg-lavender/50"
      >
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
      </Reveal>

      {/* IDENTITÉ — vision, mission, signature et verset (animés au défilement) */}
      <VisionSignature settings={settings} />

      {/* ÉVÉNEMENTS */}
      {events.length > 0 ? (
        <Reveal as="section" className="bg-lavender/50 py-16 sm:py-20">
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
        </Reveal>
      ) : null}

      {/* PREDICATIONS */}
      {sermons.length > 0 ? (
        <Reveal as="section" className="container-page py-16 sm:py-20">
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
        </Reveal>
      ) : null}

      {/* DÉPARTEMENTS */}
      {departments.length > 0 ? (
        <Reveal as="section" className="relative isolate overflow-hidden bg-brand-dark py-16 text-white sm:py-20">
          <div className="aurora-blob top-[-20%] left-[-10%] h-72 w-72 bg-brand-royal/40" aria-hidden="true" />
          <div className="aurora-blob right-[-10%] bottom-[-25%] h-80 w-80 bg-eagle/25 [animation-delay:-8s]" aria-hidden="true" />
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
                <div key={department.id} className="text-ink transition duration-300 hover:-translate-y-1">
                  <DepartmentCard department={department} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* GALERIE */}
      {albums.length > 0 ? (
        <Reveal as="section" className="container-page py-16 sm:py-20">
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
        </Reveal>
      ) : null}

      {/* ANNONCES + TEMOIGNAGES */}
      <Reveal as="section" className="bg-lavender/50 py-16 sm:py-20">
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
      </Reveal>

      {/* CTA */}
      <Reveal as="section" className="container-page py-16 sm:py-20">
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand-royal to-brand-dark px-6 py-12 text-center text-white sm:px-12">
          <div className="aurora-blob top-[-30%] left-1/4 h-64 w-64 bg-gold/20" aria-hidden="true" />
          <div className="aurora-blob right-1/4 bottom-[-40%] h-64 w-64 bg-eagle/30 [animation-delay:-9s]" aria-hidden="true" />
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
      </Reveal>
    </>
  );
}
