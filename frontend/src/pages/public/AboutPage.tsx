import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, Compass, HandHeart, HeartHandshake, MapPin, Sparkles, Users } from 'lucide-react';
import { api } from '../../services/api';
import { useChurchSettings } from '../../hooks/useChurchSettings';
import type { Department } from '../../types';
import { Button, PageHeader, SectionHeading } from '../../components/ui';
import { DepartmentCard } from '../../components/public/Cards';

const VALUES = [
  {
    icon: BookOpen,
    title: 'La Parole au centre',
    text: 'Chaque enseignement est ancré dans les Écritures, pour une foi solide et éclairée.',
  },
  {
    icon: HeartHandshake,
    title: 'Une famille',
    text: 'Personne ne marche seul : accueil, écoute, accompagnement et entraide fraternelle.',
  },
  {
    icon: HandHeart,
    title: 'Le service',
    text: 'Des talents mis à contribution pour la maison de Dieu et pour la cité.',
  },
  {
    icon: Compass,
    title: 'La mission',
    text: 'Un appel à témoigner de l’Évangile au quotidien, dans nos familles et nos métiers.',
  },
];

export function AboutPage() {
  const { settings } = useChurchSettings();
  const departmentsQuery = useQuery({
    queryKey: ['public', 'departments'],
    queryFn: ({ signal }) => api.get<{ departments: Department[] }>('/public/departments', undefined, signal),
  });
  const departments = departmentsQuery.data?.departments ?? [];
  const serviceTimes = settings.serviceTimes.length > 0 ? settings.serviceTimes : [];

  return (
    <>
      <PageHeader
        eyebrow="Notre église"
        title={settings.churchName}
        description={settings.tagline ?? settings.slogan}
      />

      <section className="container-page grid gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-brand-dark">Une maison où l’on grandit</h2>
            <div className="prose-church space-y-4 text-base leading-relaxed text-muted">
              <p>
                {settings.about ??
                  "La Forteresse de l’Éternel est une église évangélique née d’un petit groupe de prière à Abidjan. Convaincus que Dieu est un refuge pour son peuple, nous avons à cœur de créer un espace où chacun peut rencontrer Dieu, être restauré et trouver sa place."}
              </p>
              <p>
                Nous croyons à la puissance de la Parole, à la prière et à la vie fraternelle. Nous croyons aussi
                que chaque croyant est appelé à servir : c’est pourquoi nos départements sont ouverts à tous ceux
                qui veulent s’engager.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="surface p-5">
              <Sparkles className="mb-2 h-5 w-5 text-brand-royal" aria-hidden="true" />
              <h3 className="font-display text-lg font-semibold text-brand-dark">Notre vision</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {settings.vision ?? 'Former des disciples affermis dans la Parole et engagés dans la mission.'}
              </p>
            </div>
            <div className="surface p-5">
              <HeartHandshake className="mb-2 h-5 w-5 text-brand-royal" aria-hidden="true" />
              <h3 className="font-display text-lg font-semibold text-brand-dark">Notre mission</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {settings.mission ?? 'Accueillir chacun, le former à marcher avec Christ et l’envoyer servir.'}
              </p>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface p-6">
            <h2 className="font-display text-lg font-semibold text-brand-dark">Nos rendez-vous</h2>
            {serviceTimes.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Les horaires seront publiés prochainement.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {serviceTimes.map((service, index) => (
                  <li key={`${service.label}-${index}`} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-brand">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{service.label ?? 'Culte'}</p>
                      <p className="text-xs text-muted">
                        {[service.day, service.time, service.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-brand-dark p-6 text-white">
            <MapPin className="h-5 w-5 text-gold" aria-hidden="true" />
            <h2 className="mt-2 font-display text-lg font-semibold">Nous rendre visite</h2>
            <p className="mt-1 text-sm text-white/75">
              {settings.address ?? 'Abidjan'}
              {settings.city ? `, ${settings.city}` : ''}
              {settings.country ? ` — ${settings.country}` : ''}
            </p>
            <Link to="/contact" className="mt-4 inline-block text-sm font-semibold text-gold hover:text-white">
              Nous contacter →
            </Link>
          </div>
        </aside>
      </section>

      <section className="bg-lavender/50 py-14">
        <div className="container-page space-y-8">
          <SectionHeading
            eyebrow="Nos valeurs"
            title="Ce qui nous anime"
            description="Quatre convictions qui façonnent notre manière de vivre l’église."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="surface p-5">
                <Icon className="mb-3 h-6 w-6 text-brand-royal" aria-hidden="true" />
                <h3 className="font-display text-base font-semibold text-brand-dark">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {departments.length > 0 ? (
        <section className="container-page py-14">
          <div className="space-y-8">
            <SectionHeading
              eyebrow="Servir"
              title="Nos départements"
              description="Des équipes où chacun peut grandir et contribuer selon ses dons."
              action={
                <Link to="/departements">
                  <Button variant="outline" icon={<Users className="h-4 w-4" aria-hidden="true" />}>
                    Tous les départements
                  </Button>
                </Link>
              }
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {departments.slice(0, 6).map((department) => (
                <DepartmentCard key={department.id} department={department} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="container-page pb-16">
        <div className="rounded-3xl border border-line bg-lavender/60 px-6 py-10 text-center">
          <h2 className="text-2xl font-semibold text-brand-dark">Envie de nous rejoindre ?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
            Créez votre compte, présentez-vous à un responsable et participez à la vie de l’église.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/inscription">
              <Button>Demander mon adhésion</Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline">Poser une question</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
